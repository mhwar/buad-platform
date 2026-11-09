# 04 — Domain logic, sample data, infrastructure, v1 (بُعد / Buad)

Reference for rebuilding the platform (prototype + iOS) **without the repo**. Source of truth when this
was written: `v2/packages/domain/src/*.ts` (pure TS, no I/O), `v2/tools/migrate`, `v2/apps/api`,
`.github/workflows`, and the v1 files at the repo root. Every formula is quoted from the code, and the
worked numbers below come from running the real functions.

Conventions used in this file:
- **H** = halalas (integer). 1 SAR = 100 H. **R** = riyals (float, 2 dp).
- `r2(n) = Math.round(n*100)/100`, which rounds to 2 dp the JS way (half toward +∞ on .5 at that scale).
- Dates are ISO `YYYY-MM-DD` strings compared lexicographically. Timestamps are epoch **seconds**.
- `Math.round` everywhere is JS rounding: half toward +∞, so `Math.round(-2.5) = -2`.

---------------------------------------------------------------------------------------------------

## 0. Package map (`@buad/domain`, `v2/packages/domain/src`)

`index.ts` re-exports everything from: company, documents, finance-adapter, fincalc, money, numbering,
permissions, plans, pricing, product-stats, quotes, realized, receipts, receivables, sales,
templates/v1-templates, text, vat, year-review.

| File | Units | Purpose |
|---|---|---|
| money.ts | H | Halalas brand type, riyal↔halala conversion, exact allocation, SAR formatting |
| vat.ts | mixed | VAT inside gross, VAT per receipt, quarterly return, invoice checks, due dates |
| fincalc.ts | R | Exact port of v1 `FinCalc.calc`: project contract/budget/actual/profit |
| finance-adapter.ts | H→R | Stored v2 finance (H) → finCalc input (R). Adds pending totals |
| company.ts | R (shares H) | Company finance: period result, distributable, retained, bank minimum, partner split |
| realized.ts | R | Realized profit by receipts, quarter view, quarter distribution, profit balances |
| receipts.ts | — | Suggests receipt dates from v1 data, plus warnings |
| receivables.ts | H | Aging buckets, 13-week cash forecast, reminder text |
| year-review.ts | H | Per-project review flags for «مراجعة السنة» |
| pricing.ts | R in/out, H inside | Product cost-plus pricing (margin/markup/fixed) and readiness checklist |
| product-stats.ts | R | Per-product performance and rule-based insights |
| quotes.ts | H | Quote totals, validity, weighted pipeline, quote stats, instalment schedules |
| sales.ts | H | CRM: activity types, sources, relationship, follow-ups, pipeline stages and stats |
| plans.ts | — | Strategic/operational plans: attainment, progress, status, pace, platform metrics |
| permissions.ts | — | Permission registry, 8 default roles, role resolution |
| numbering.ts / text.ts | — | Numbering defaults, code formatting, Arabic name normalisation |
| documents.ts | R | Contract/letter variables, Hijri dates, Arabic number words, clause numbering |
| templates/v1-templates.ts | — | Contract templates, clause library and the cashback letter, copied verbatim from v1 |

Tests: one `*.test.ts` beside each file (vitest). `fincalc.parity.test.ts` loads the **real v1
`FinCalc` source out of `app.html`** (from `var FinCalc = {` to the next `/* ═══`), evaluates it
with `new Function("DB", …)`, and compares it with the TS port on randomised inputs. The inputs come from
a seeded LCG (`seed = seed*1664525+1013904223 >>> 0`) and include junk values such as `""`, `null` and `"abc"`.

---------------------------------------------------------------------------------------------------

## 1. money.ts — halalas

```ts
type Halalas = number & { __brand: "Halalas" }
halalas(n)        // throws RangeError unless Number.isInteger(n)
fromRiyals(r)     // throws if !isFinite. |r|*100 → toPrecision(15) → Math.round → re-apply sign
                  //   ⇒ rounding is half AWAY from zero; toPrecision(15) removes float noise
toRiyals(h) = h/100
add(...xs)        // integer sum
allocate(total, weights)   // largest-remainder split; parts always sum to total
formatSar(h)      // Intl "ar-SA-u-nu-latn" currency SAR (Latin digits)
```
- `fromRiyals(1.005) = 101`, `fromRiyals(-2.345) = -235`.
- `allocate`: it throws if the weights are empty, if any weight is negative, or if every weight is zero. It computes
  `raw_i = total*w_i/sum` and `floor` of each, then hands out the remaining halalas one at a time by descending
  fractional part, with ties going to the lower index. Example: `allocate(10000,[1,1,1]) = [3334,3333,3333]`.
- `formatSar(1234567)` → `"‏12,345.67 ر.س.‏"` (includes RLM marks).
- Rule: **money crosses module and DB boundaries only as integer halalas**. Columns are named `*_halalas`.

## 2. vat.ts — VAT (ZATCA, standard rate, quarterly)

| Function | Formula / rule |
|---|---|
| `vatOfGrossHalalas(gH, rate)` | `rate<=0 ? 0 : round(gH*rate/(100+rate))` |
| `vatInsideHalalas(gH, rate)` | `round(gH*rate/(100+rate))` (no guard). For example, 15% gives 15/115 of the amount |
| `receiptParts(receipt R, {gross,net,vat})` | if `gross<=0` → `{base:r2(receipt), vat:0}`; else `vat=r2(receipt*c.vat/c.gross)`, `base=r2(receipt-vat)`. Refunds are negative receipts and reduce the VAT |
| `vatReturn(sales[], purchases[])` (each `{base,vat}`) | sums each side with r2 → `{sales, purchases, outputVat=s.vat, inputVat=p.vat, netPayable=r2(s.vat-p.vat)}`. A negative result is refundable |
| `invoiceGaps({supplierName,supplierVatNo,invoiceNo,invoiceDate})` | returns any of `supplier` (blank), `vat_no` (must match `/^3\d{13}3$/`, i.e. 15 digits starting and ending with 3), `invoice_no` (blank), `invoice_date` (not ISO) |
| `vatPeriodKey(y,q)` | `"2026-Q3"` |
| `filingDueDate(y,q)` | the last day of the month after the quarter. Q1→04-30, Q2→07-31, Q3→10-31, Q4→**next year 01-31** |

Concepts:
- **Output VAT (sales):** each approved receipt carries its share of the contract VAT, counted on the day the money
  arrived. Example: contract gross 115,000 = net 100,000 + VAT 15,000. A receipt of 57,500 → base 50,000 and VAT 7,500.
- **Input VAT (purchases):** project expenses (`finance_entries`) and company purchases (`company_entries`) with
  `tax_invoice=1` carry `vat_amount_halalas`, supplier name, supplier VAT number, invoice number and invoice date.
- Since migration 0028, a filing (`vat_filings`) per `period_key` stores output, input and net amounts, plus filed/paid info.

## 3. fincalc.ts — project finance (exact v1 port, riyals)

Input (v1 shape; values may be numbers or numeric strings; `n(v)=parseFloat(String(v??""))||0`):
```ts
FinCtrl { contract_value, vat_pct, vat_included, mkt_internal,
          exec_v, exec_type:"pct"|"fixed", exec_base:"net"|"gross",   // أتعاب التنفيذ (company fee)
          mkt_v, mkt_type, mkt_base,                                 // تسويق (marketing)
          cb_v,  cb_type,  cb_base,                                  // كاش باك (cashback to client/association)
          cf_v,  cf_type,  cf_base,                                  // رسوم إضافية (labelled VAT/fees, see missingItems)
          op_cats?: string[] }
FinEntry { type:"expense"|"income", cat, amount, profit_margin, profit_margin_type:"pct"|"fixed" }
FinInput { ctrl, budget:[{amount}], entries:[FinEntry] }
DEFAULT_OP_CATS = ["salary","logistics","materials","other"]
```
Fees default to `type="pct"` and `base="net"`.

Algorithm, in this exact order:
```
cv = n(contract_value); vatPct = n(vat_pct)
if vat_included: contractNet = cv/(1+vatPct/100); vatAmt = cv - contractNet
else:            contractNet = cv;                 vatAmt = cv*vatPct/100
grossTotal = contractNet + vatAmt
fee(v,type,base) = type=="fixed" ? n(v) : (base=="gross"?grossTotal:contractNet)*n(v)/100
execAmt=fee(exec); mkt=fee(mkt); cb=fee(cb); cfAmt=fee(cf)
budgetTotal = Σ budget.amount
expenses = entries.type=="expense"; incomes = entries.type=="income"
totalExpenses = Σ expenses; totalIncome = Σ incomes
execIncomeReg = Σ incomes with cat=="exec"           // exec fee actually registered as income
profitMargins = Σ over expenses of (pmType=="fixed" ? pm : pm*amount/100)
nonExecInc    = totalIncome - execIncomeReg
mktShare      = mkt_internal ? mkt : 0                // internal marketing counts as company profit
profit = execIncomeReg>0 ? max(0, execIncomeReg + profitMargins + nonExecInc + mktShare)
                         : max(0, execAmt       + profitMargins + nonExecInc + mktShare)
available     = grossTotal - execAmt - mkt - cb - cfAmt     // money left for execution
obligations   = execAmt + mkt + cb + cfAmt
opCats        = ctrl.op_cats?.length ? op_cats : DEFAULT_OP_CATS
opExpenses    = Σ expenses with cat ∈ opCats
totalAllEntries = Σ all entries (income + expense)
remaining = remainingFromGross = grossTotal - totalAllEntries ; totalDeductions = totalAllEntries
remainingExec = available - opExpenses
totalSpent = Σ expenses
missingItems (Arabic, in this order):
  cfAmt>0 && no entry cat "cf"       → "ضريبة القيمة المضافة (الرسوم)"
  execAmt>0 && no entry cat "exec"   → "أتعاب التنفيذ"
  mkt>0 && no entry cat "mkt"        → "التسويق"
  cb>0 && no entry cat "cashback"    → "كاش باك"
```
Returns: `cv, vatIncluded, vatPct, vatAmt, contractNet, grossTotal, execAmt, mkt, cb, budgetTotal,
available, obligations, opExpenses, remainingExec, totalSpent, remainingFromGross, totalDeductions,
opCats, defaultOpCats, totalExpenses, totalIncome, totalAllEntries, execIncomeReg, nonExecInc,
profitMargins, profit, remaining, cfAmt, isInternalMkt, missingItems`.

Worked example (from a real run). Contract 115,000 with VAT included at 15%. Exec fee 10% of net. CF 15% of net.
Marketing 5%. Cashback fixed at 2,000. Budget lines 40,000 and 20,000. Entries: salary expense 30,000 with a 10% margin,
logistics expense 12,000, exec income 10,000, cf expense 15,000.
→ contractNet 100,000 · vatAmt 15,000 · gross 115,000 · execAmt 10,000 · mkt 5,000 · cb 2,000 · cf 15,000
· obligations 32,000 · available 83,000 · budgetTotal 60,000 · opExpenses 42,000 · remainingExec 41,000
· totalExpenses 57,000 · totalIncome 10,000 · profitMargins 3,000 · **profit 13,000** (10,000 exec + 3,000 margins)
· remaining 48,000 · missingItems `["التسويق","كاش باك"]`.
(Floats carry noise, e.g. `14999.999999999985`. Round only for display.)

Agreement items: `AGREEMENT_ITEMS = ["exec","cf","mkt","cashback"]` (schema). v1 auto-created entries
with `note "من الاتفاقية"` (typeMap `exec→income`, `vat/mkt/cashback/cf→expense`), and v2 marks them `source="agreement"`.
Category labels (v1 catLabel): vat ضريبة, exec أتعاب (التنفيذ), mkt تسويق, cashback كاش باك, cf رسوم إضافية,
salary رواتب, logistics لوجستيات, materials مواد, other أخرى. A budget category is `bdg_<budgetRowId>`.

### finance-adapter.ts
- `StoredFinance` = v2 rows. `ctrl` holds `contractValue` (H), `vatIncluded`, `vatPct`, `execV/Type/Base`,
  `mkt…`, `mktInternal`, `cb…`, `cf…` and `opCats`. Each entry has `type`, `cat`, `amount` (H), `profitMargin`,
  `profitMarginType` and `status` (`""|paid|pending|cancelled`). Budget rows are `{amount H}`.
- `toFinInput(f)` divides money by 100 and **drops cancelled entries**.
- `summarize(f)` = `finCalc(toFinInput(f))` plus `pendingExpenses` and `pendingIncome` (R): the sums of
  `status=="pending"` entries by type. Pending entries still count inside finCalc.

## 4. company.ts — company finance («مالية الشركة», port of v1 «مالية المنصة»), riyals

Types: `CompanyEntryLite {type, category, date, paymentDate?, amount}`,
`ProjectProfitLite {id, status, profit, remainingExec, date?}`,
`DistributionLite {status:"draft"|"completed", distributed, retained, retainedCategory:"ops"|"dev"|"reserve"|null}`.

| Function | Rule |
|---|---|
| `earning(p)` | true when the status is `active` or `completed` (draft, paused and cancelled earn nothing) |
| `companyCalc(projects, entries, from?, to?)` | `projectProfit = Σ max(0,p.profit)` over earning projects with `p.date` in range. `serviceIncome = Σ income` with category ≠ `project_fee` and `(paymentDate‖date)` in range. `companyExpenses = Σ expense` with `date` in range. Returns `{projectProfit, serviceIncome, companyExpenses, income=pp+si, netProfit=pp+si-ce}`, all r2. With no from/to, everything counts. An item with no date fails any bounded range |
| `distributable(projects, entries, dists)` | all-time `companyCalc` plus `distributed = Σ completed.distributed`, `retained = Σ completed.retained`, `available = netProfit - distributed - retained` |
| `retainedTotals(dists)` | sums completed `retained>0` by category (null → reserve) → `{ops, dev, reserve, total}` |
| `bankMinimum(projects)` | `Σ max(0, remainingExec)` over **active** projects: the money that must stay in the bank |
| `splitShares(amountH, partners[{id,name,sharePct}])` | `amount_i = round(amountH*pct_i/100)`. If the shares total 100 (within 0.005), the rounding difference goes to the **largest share** (the first one on ties). Example: 100001 H at 50/30/20 → 50001/30000/20000 |
| `splitDistribution(availH, pct)` | `p=clamp(pct,0,100)`; `distributed=max(0,round(availH*p/100))`; `retained=max(0,availH-distributed)` |
| `periodRange(type, today)` | `q1..q4` or `annual` of today's year. Any other value gives the current quarter |
| `periodLabel(type, from, to)` | «الربع الأول 2026» … «سنة 2026», else `"from — to"` |

Company categories (schema enums):
- Income: `project_fee` (v1 sync leftover, never counted), `subscription`, `setup`, `consulting`, `commission`, `other`.
- Expense: `hosting`, `marketing`, `payroll`, `tools`, `legal`, `other`, `asset`, `purchase`, `zakat`, `gov_fees`.
- Retained purposes: `ops` تشغيل, `dev` تطوير, `reserve` احتياطي. Distribution status is `draft` or `completed`.

## 5. realized.ts — realized profit and the quarter distribution (current v2 rule, «F4: one rule»)

Principle: a project's profit is **realized in proportion to the money received**. Distributions remember
how much they took from each project (`distribution_projects`), so the same profit is never paid twice.
If the profit later drops below what was paid, the project's `available` goes negative and is
**carried** into every following distribution.

| Function | Rule |
|---|---|
| `dayBefore(iso)` | the ISO date minus one day |
| `receivedUpTo(receipts, pid, upTo?)` | Σ amounts for the project with `date<=upTo` (all when upTo is absent). Refunds are negative |
| `realizedProfit(profit, gross, received)` | returns 0 if gross≤0, profit≤0 or received≤0. Else `r2(profit*min(1, received/gross))`. Example: (20,000, 115,000, 57,500) → 10,000 |
| `quarterView(projects, receipts, distributed{pid→R}, from, to)` | per project: `receivedToDate` (≤to), `before` (≤from−1), `realizedToDate`, `realizedBefore`, `receivedInPeriod=to−before`, `realizedInPeriod`, `distributed`, `available=realizedToDate−distributed`. Flags: `no_receipts` (gross>0 and no receipts ever), `over_distributed` (available<−0.005), `estimate` (no finance, or agreement items not registered), `pending_expenses`, `cancelled`, `inactive` (draft or paused). Totals: `receivedInPeriod`, `realizedInPeriod`, `available`, `positive` (Σ>0) and `carried` (Σ<0) |
| `quarterDistributable(rows, selected[], companyIncome, companyExpenses)` | `projects = Σ available` over selected rows with available>0. `carried = Σ available<0` over **all** rows, chosen or not. `companyNet = inc−exp`. `total = projects + carried + inc − exp`. `perProject` = the chosen positive rows plus every negative carry |
| `quarterOf(iso)` → `{year, q}` · `quarterRange(y,q)` → `{from,to}` · `previousQuarter` | — |
| `QUARTER_NAMES` | `["", "الربع الأول", "الربع الثاني", "الربع الثالث", "الربع الرابع"]` |
| `profitBalances({projects, receipts, companyIncome, companyExpenses, settled[]})` | `realized = Σ realizedProfit` over non-cancelled projects (all receipts). `companyNet`. `distributed`/`retained` = Σ settled. `undistributed = realized + companyNet − Σ settled.netProfit` («أرباح غير موزّعة») |

The API (`modules/company-finance.ts`) has distribution modes `period | project | quarter | manual`:
- `quarter` → `quarterDistributable` (gross income = projects + company income; gross expenses = company expenses − carried).
- `project` → `max(0, realizedProfit − alreadyPaid)` for one project.
- `period` (default) → per project, `realized − paid` where that is >0, plus the company net not yet covered by
  earlier completed distributions.
- `manual` → a past distribution entered at its actual amount, taken from one project or spread over a quarter's
  open projects in proportion to their `available`.
- After any mode: `netH = max(0, fromRiyals(net))`, then `splitDistribution(netH, pct)`, then `splitShares(distributed, partners)`.
- Stamps: `open`, `partial` or `distributed` (fully distributed when leftover ≤ 0.5 R). Project close (migration 0030)
  stamps `closed_at/by/note`, and a closed project's profit is final.

## 6. receipts.ts — receipt date suggestions (from v1 data)

- `suggestReceipt({payDate, execIncomeDate, contractDate, startDate})` returns the first valid ISO value in this order:
  `pay_date` («من «تاريخ الاستلام» المسجّل في المنصة القديمة»), then `exec_income` (date of a paid exec-fee entry),
  then `contract_date`, then `start_date`. Each comes with an Arabic `basis` text. Returns null when none is valid.
  A suggestion is never stored: it counts only after a person approves it, which creates a `project_receipts` row
  with `basis`, `approved_by` and `approved_at` (migration 0008).
- `receiptWarnings(date, contractDate, today)` can return `future` (date > today), `before_contract`, and
  `near_quarter_edge` (less than 3 days from the quarter start or end, because the date decides the quarter).
- `quarterLabelOf(date)` → «الربع الثالث 2026».

## 7. receivables.ts — aging and cash forecast (H)

- `addDays(iso,n)` and `daysBetween(from,to)` work in UTC day numbers.
- `AGING_BUCKETS`: `current` غير مستحقة, `d1_30` 1–30 يوماً, `d31_60`, `d61_90`, `d90` أكثر من 90 يوماً.
- `bucketOf(due, today)`: late = today−due. ≤0 current, ≤30, ≤60, ≤90, else d90.
- `aging(items[{dueDate,amount}], today)` → `{buckets{key:{amount,count}}, overdue (every bucket except current), total}`.
- `cashForecast({today, weeks=13, opening, inflows[], outflows[]})`: week i spans `today+7i … today+7i+6`.
  Any movement that is undated or dated ≤ today lands in week 1. Anything past the horizon is dropped.
  Each week has `net = in − out` and a running `balance` from `opening`.
- `firstShortfall(weeks)` returns the first week with balance < 0, or null.
- `reminderText({client, project, label, amountRiyals, dueDate, org})` → «السلام عليكم {client}،\nنذكّركم بدفعة «{label}» لمشروع «{project}» بمبلغ {amount}، وتاريخ استحقاقها {due}.\nنشكر لكم تعاونكم.\n{org}».
- Instalments live in `payment_schedule` (label, due_date, amount_halalas, status, receipt_id, received_at).

## 8. year-review.ts — «مراجعة السنة» (H)

Input: `{status, gross (with VAT), received, estimated, overdueLines}`. `SLACK = 100` H (one riyal). `due = gross − received`.

| Flag | Condition | Label |
|---|---|---|
| `closed_not_paid` | status=completed, gross>0, due>100 | مكتمل وعليه متبقٍّ |
| `paid_not_closed` | status active or paused, gross>0, due≤100 | محصَّل بالكامل ولم يُغلق |
| `overdue` | overdueLines>0 | دفعة متأخرة |
| `no_receipts` | not cancelled, gross>0, received≤0 | لا استلامات مسجّلة |
| `no_contract` | estimated (value = expected value + VAT) and not cancelled | بلا بيانات عقد |

Each flag also has a hint in `REVIEW_FLAG_HINT`, e.g. no_contract → «القيمة تقديرية من القيمة المتوقعة؛ أدخل رقم العقد وقيمته.».

## 9. pricing.ts — product pricing (planning only, not ledger)

`PricingIn {method:"margin"|"markup"|"fixed", value (pct), lines[{id,label,unit,cost R}], packages[{packageId, qty{lineId:n}, fixedPrice R}]}`.

`priceQuote(model, qty, fixedPrice, vatRatePct)`:
1. `used` = lines with qty>0. `unitH = fromRiyals(max(0,cost))`, `amountH = round(unitH*qty)`, `costH = Σ amountH`.
2. Status: `empty` (no line used) → `needs_costs` (a used line has cost ≤ 0; its ids go in `missing`) →
   fixed with price 0 → `needs_price` → margin with value ≥ 100 → `invalid` → otherwise `ok`.
3. `priceH`: fixed = `fromRiyals(fixedPrice)`; margin = `round(costH/(1−v/100))`; markup = `round(costH*(1+v/100))`.
4. `vatH = round(priceH*max(0,vat)/100)`; `profitH = priceH − costH`.
   `marginPct = r2(profit/price*100)`; `markupPct = r2(profit/cost*100)`;
   `marginIfCostUp10 = r2((price − cost*1.1)/price*100)`. Everything is returned in R.
- Example: margin 30%, trainer (مدرب) 1,500 × 2 days + hall (قاعة) 800 × 2 → cost 4,600, price 6,571.43,
  VAT 985.71, total 7,557.14, profit 1,971.43, margin 30, markup 42.86, marginIfCostUp10 23.
- `packageQuote(model, packageId, vat)` prices a package at its typical quantities.
- `productReadiness(content, pricing, vat)` is a checklist. Keys: `hero` (title and subtitle), `packages` (≥1),
  `costs` (every package prices `ok`), `intake` (≥1 question), `process` (≥3 stages), `faq` (≥2).
  `comingSoon` skips the packages and costs checks.
- `plannedMargin(method, v)` (product-stats.ts): margin → v; markup → `r2(v/(100+v)*100)`; fixed → null.

## 10. product-stats.ts — what a product/service has done (R)

`productStats({projects: StatProject[], requests[{status, createdAt}], plannedMarginPct, packageNames, now})`
- Totals: projects, active, completed, entities (distinct clients), repeatEntities (clients with ≥2 projects),
  contractNet, gross, received, expenses, profit, `realizedProfit = Σ realizedProfit(p.profit, p.gross, p.received)`,
  `marginPct = profit/contractNet*100`, `avgContract`.
- Packages: per packageId, with name «بدون باقة محددة» when empty. Gives projects, net, profit, marginPct and share%.
  Sorted by projects, then net.
- Entities are sorted by projects, then net, then name. The trend is by `quarterKey(startDate)` = `"2026-Q3"`, with
  `"—"` (unknown date) last.
- Funnel: total, new, contacted, quoted (= quoted + negotiating), won, lost, conversionPct = won/total.
- `marginGap = marginPct − planned` (null when there is no plan or no projects).
- Insights, as codes the UI words:
  - `no_projects`
  - `top_package` (share ≥60% and ≥2 projects)
  - `margin_below_plan` (gap ≤ −2) and `margin_above_plan` (gap ≥ 2)
  - `repeat_entities`
  - `no_package`
  - `losing_projects` (profit < 0)
  - `stale_requests` (status new for more than 3 days)
  - `low_conversion` (≥5 requests and conversion < 20%)

## 11. quotes.ts — quotes (عروض الأسعار), H

- `quoteTotals(items[{label, qty, unitHalalas}], discountH, vatPct)`: `subtotal = Σ round(qty*unit)`.
  `discount = clamp(round(d), 0, subtotal)`. `net = subtotal − discount`. `vat = round(net*max(0,vat)/100)`.
  `total = net + vat`. Example: 3 × 33,333 H with a 5,000 discount at 15% → 99,999 / 5,000 / 94,999 / 14,250 / 109,249.
- `quoteIsValid(validUntil, today)` is true when validUntil is empty or ≥ today.
- `STAGE_PROBABILITY` / `STAGE_P` = new 0.1, contacted 0.2, quoted 0.4, negotiating 0.65.
  `weightedPipeline(leads)` = `round(Σ value*p)` (closed stages count 0).
- `quoteStats(list, today, now)` returns:
  - `sent` (status ≠ draft), `accepted`, `rejected`
  - `acceptRate = acc/(acc+rej)` to 1 dp, or null
  - `acceptedValue` and `avgValue` (over sent)
  - `expiring` (status sent, validUntil ∈ [today, today+7])
  - `waiting` (status sent, updatedAt older than 7 days)

  Quote statuses: draft, sent, accepted, rejected (as filtered).
- `SCHEDULE_KINDS`, `SCHEDULE_LABEL` and `scheduleSplit(kind, totalH, startIso)`:
  - `full`: 100% due at +30 days, label «دفعة واحدة بعد 30 يوماً».
  - `half`: 50% at +0 and 50% at +60.
  - `thirds`: 40% at +0, 30% at +30, 30% at +60.
  - `none`: returns [].

  Each line except the last is `round(total*pct/100)`. The **last line takes the remainder**. Example: thirds of
  1,000,001 H starting 2026-01-01 → 400,000 (01-01), 300,000 (01-31), 300,001 (03-02).
  Line labels: «الدفعة الأولى (40%)», «الدفعة الثانية (30%)», «الدفعة الثالثة (30%)», «الدفعة الكاملة».

## 12. sales.ts — light CRM and pipeline

- `ACTIVITY_TYPES`: call اتصال, meeting اجتماع, visit زيارة, email بريد, whatsapp واتساب, note ملاحظة.
- `SOURCES`: site الموقع, referral إحالة, event معرض أو فعالية, call اتصال وارد, social تواصل اجتماعي, other أخرى.
- `relationshipOf({activeProjects, completedProjects, openRequests, openQuotes, lastTouch, createdAt, now})` checks
  these in order of precedence:
  1. `active` (عميل نشط): activeProjects > 0.
  2. `prospect` (محتمل): openRequests + openQuotes > 0.
  3. `former` (عميل سابق): completedProjects > 0.
  4. `dormant` (خامل): `now − max(lastTouch, createdAt) > 180 days` (`DORMANT_AFTER_DAYS = 180`).
  5. `new` (جديد): anything else.

  The relationship is never typed by hand.
- `followUpState(date, today)` returns `none` (no date), `overdue` (d<0, label متأخرة), `today` (اليوم),
  `soon` (≤7 days, هذا الأسبوع) or `later` (لاحقاً).
- `daysSince(epoch, now)` returns null when epoch is 0. `cleanTags(tags)` trims each tag, cuts it to 24 chars,
  removes duplicates and keeps at most 10.
- Stages: `OPEN_STAGES = new, contacted, quoted, negotiating` and `STAGES = open + won, lost`.
  Labels: جديد, مؤهَّل, عرض سعر, تفاوض, مكسوب, خاسر. Hints, e.g. new «وصل الطلب ولم نتواصل بعد».
  The stored values never change; only the labels do.
- `pipelineStats(leads[{status, valueHalalas, createdAt, updatedAt, source}])` gives per open stage
  `{count, value, weighted = round(value*p)}` plus the open totals.
- `winRate(won, lost)` is a percentage to 1 dp, or null. `avgCycleDays(won)` = mean of (updatedAt − createdAt) in
  days, rounded.
- `STALE_DAYS = 7`. `isStale(lead, now)` is true for an open stage untouched for more than 7 days.
- `bySource(leads)` returns `{source, total, won, lost, rate}` sorted by total. `monthlyWon(leads, now, 12)` gives the
  value won per `YYYY-MM` by the month of `updatedAt`. `wonThisQuarter(leads, now)`.
- `weightedValue(status, value)` = `r2(value*p)` for open stages, else 0.
  `daysInStage({stageChangedAt, createdAt}, now)`.
- Leads are stored in `product_requests` (status = stage, `value_halalas`, `owner_id`, `follow_up_at`,
  `lost_reason`, `stage_changed_at`, `package_id`).

## 13. plans.ts — strategic and operational plans (OKR-like)

- `attainment({baseline, target, current, direction})`: if target == baseline, returns 1 when the target is met
  (≤ for "down", ≥ for "up"), else 0. Otherwise `clamp01((current − baseline)/(target − baseline))`, which also
  works when lower is better.
- `INITIATIVE_WEIGHT` = todo 0, doing 0.5, blocked 0.25, done 1. `initiativeDone(i)`: done → 1; with tasks → done/total;
  otherwise the weight.
- `objectiveProgress(indicators, initiatives)` = mean of [mean attainment, mean initiative completion], counting only
  the parts that exist. With neither, it returns null.
- `cycleProgress(objs[{weight, progress}])` = average weighted by `weight`, over objectives with progress ≠ null and
  weight > 0.
- `planStatus(progress, start, end, today)`:
  1. null → `no_data`; ≥1 → `done`.
  2. Bad range → `on_track` if progress > 0, else `no_data`.
  3. today < start → `not_started`.
  4. Otherwise `expected = elapsed share`, `gap = expected − progress`: gap ≤ 0.10 → `on_track`, ≤ 0.25 → `at_risk`,
     else `late`.

  Labels: بلا قياس, لم يبدأ, على المسار, معرّض للتأخر, متأخر, مكتمل. Example: 0.4 on 2026-11-09 for the 2026 year → late.
- `yearQuarterRange(year, q)`: q 1–4 gives that quarter; anything else gives the whole year.
- `PLATFORM_METRICS` are indicators the platform follows by itself, linked via `source = "platform:<key>"`
  (`metricOf(source)` extracts the key):

  | Key | Label | Unit |
  |---|---|---|
  | `contracts` | قيمة العقود الجديدة | ر.س |
  | `projects_started` | مشاريع بدأت | مشروع |
  | `projects_completed` | مشاريع مكتملة | مشروع |
  | `clients_new` | عملاء جدد | عميل |
  | `requests` | طلبات العروض الواردة | طلب |
  | `requests_won` | طلبات تحوّلت إلى عقد | طلب |
  | `conversion` | نسبة تحويل الطلبات | % |
  | `revenue` | الإيرادات المحصّلة | ر.س |
  | `products_published` | المنتجات المنشورة في الموقع | منتج |
  | `associations_active` | جمعيات لها مشروع نشط | جمعية |

  `MONEY_METRICS = revenue, contracts`: these are shown only to people who may see finance.
  `ADDITIVE_METRICS` = revenue, contracts, projects_started, projects_completed, clients_new, requests, requests_won.
- `targetPace({target, actual, start, end, today})`:
  - `total = days(end − start) + 1`; `gone = clamp(days(today − start) + 1, 0, total)`; `share = gone/total`.
  - `expected = round(target*share)`; `projected = round(actual/gone*total)`; `gap = max(0, target − actual)`.
  - `perMonthNeeded = round(gap/(remainingDays/30.44))`; `ahead = actual ≥ expected`.
  - Example: target 1.2M, actual 800k, 2026 year, today 11-09 → share 0.8575, expected 1,029,041,
    projected 932,907, perMonthNeeded 234,154, not ahead.
- `monthsOf(start, end)` returns months clipped to the range (at most 36) for cumulative charts.
- Tables: `plan_cycles` (kind, vision/mission/values, parent cycle), `plan_objectives` (weight, quarter, budget),
  `plan_indicators` (baseline/target/current/source/direction), `plan_initiatives` (status, project/product link) and
  `plan_reviews` (quarterly snapshot).

## 14. «مراجعة السنة» targets / year review

This is covered by §8 (flags) and the plan metrics in §13. The API module is `year-review.ts`.

## 15. numbering.ts / text.ts

`NUMBERING` (defaults). The org may override prefixes in «الإعدادات ← بيانات الجهة ← الترقيم».

| kind | label | prefix | yearly |
|---|---|---|---|
| project | المشاريع | PRJ | yes |
| client | العملاء | CL | no |
| quote | عروض الأسعار | QT | yes |
| doc_contract | العقود | CT | yes |
| doc_letter | الخطابات | LT | yes |
| outgoing | الصادر | ص | yes |

- `PREFIX_RE = /^[\p{L}\p{N}]{1,8}$/u` (letters or digits only; the dash is the separator).
- `formatCode(prefix, n, year?)` pads to 4 digits: `CL-0007`, `PRJ-2026-0007`.
- Counters live in `org_counters(org_id, kind, year (0 if not yearly), value)` and increment atomically.
  A sequence only grows.
- `normalizeName(s)` is used for duplicate detection. Steps: NFKC → lowercase → strip tashkeel, superscript alef
  and tatweel (`[ً-ٰٟـ]`) → `أإآٱ→ا`, `ى→ي`, `ة→ه`, `ؤ→و`, `ئ→ي` → non letters/digits become spaces → trim and
  collapse spaces. Example: «مؤسسة  الأمَل» → «موسسه الامل». Stored as `clients.name_norm`. A similar name only
  triggers a warning; a duplicate reg_no or tax_no is blocked by unique indexes.

## 16. permissions.ts

- `ACTIONS`: view عرض, edit تعديل, archive أرشفة, delete حذف, share مشاركة, profit إظهار الأرباح, manage إدارة,
  run تنفيذ.
- `PERM_MODULES`, giving keys of the form `module.action`:

  | Module | Label | Actions |
  |---|---|---|
  | clients | العملاء | view, edit, archive, delete |
  | projects | المشاريع | view, edit, archive, delete |
  | documents | المستندات | view, edit, share |
  | finance | مالية المشروع | view, edit, profit |
  | treasury | المالية العامة | view, edit |
  | vat | — | view, edit |
  | products | — | view, edit |
  | sales | — | view, edit |
  | site | — | view, edit |
  | assets | — | edit |
  | org | — | edit |
  | import | — | run |
  | plans | — | view, edit |
  | tasks | — | view, edit |
  | meetings | — | view, edit |
  | team | — | view, manage |
  | roles | — | manage |
  | audit | — | view |

  `ALL_PERMS` is the flattened list and `isPerm` checks membership.
- Scopes (projects only): `all` كل المشاريع, `team` مشاريع الفريق, `mine` مشاريعي فقط.
- `DEFAULT_ROLES`. `BASE` = clients.view, projects.view, documents.view.
  `OWNER_ONLY` = projects.delete, clients.delete, import.run, roles.manage.

  | Key | Name | Perms | Scope |
  |---|---|---|---|
  | `owner` | المالك | all; can never be restricted | all |
  | `general-manager` | المدير العام | all except OWNER_ONLY | all |
  | `finance-manager` | المدير المالي | BASE + clients.edit + documents.edit/share + finance.* + treasury.* + vat.* + audit.view + team.view + plans/tasks/meetings.view | all |
  | `project-manager` | مدير مشاريع | BASE + clients edit/archive + projects edit/archive + documents edit/share + finance view/edit/profit + products.view + sales.view + team.view + plans.view + tasks view/edit + meetings.* | all |
  | `sales` | مبيعات وعلاقات عملاء | BASE + clients.edit + projects.edit + documents edit/share + finance.view + products.view + sales.* + site.view + tasks.view + meetings.* | all |
  | `accountant` | محاسب | BASE + finance view/edit/profit + treasury.* + vat.* | all |
  | `team-member` | عضو فريق | BASE + clients.edit + projects.edit + finance.view + tasks view/edit + meetings.* | team |
  | `viewer` | مشاهد | BASE + tasks.view + meetings.view | team |

- `LEGACY_ROLE_KEY`: owner→owner, admin→general-manager, member→team-member.
  `effectiveRoleKey(assigned, legacy)` = the assigned role, else the legacy mapping, else `viewer`.
- `resolveRole(key, overrides)`: an override row (from `org_roles`) wins and its perms are sanitized, except for
  owner, which is never overridden. `allRoles` = the defaults with overrides applied, plus custom roles.
- `normalizePerms`: any action other than view or run implies `module.view`.
- `describeRole` produces Arabic lines like «العملاء: عرض، تعديل».
- `SENSITIVE_PERMS = ["finance.profit"]`. `canAssignRole(actor, target)`: only the owner can assign the owner role.

## 17. documents.ts — contract/letter variables

- `OrgProfile`: name, email, phone, website, address, reg, tax, signerName, signerTitle, signerId, bankName,
  bankIban. Stored in `org_profile`, together with logo, stamp, signature, header and footer asset ids.
- `DocClient`: name, contactName, contactTitle, regNo, taxNo, address, city, phone, email.
- `DocContext`: `{org, client?, project?{name}, finance?{grossTotal R, cashback R, contractNo, contractDate}, today}`.
- `initialVariables(ctx)` returns `{key: {value, source}}`. Sources are org, client, project, finance, default,
  manual and computed.
  - `party_a_*` (org): name, rep_name, title, id, address, phone, email, reg, tax.
  - `party_b_*` (client): name, rep_name (contactName), title, id (regNo), reg, address (address‖city), phone,
    email, tax.
  - `contract_date_gregorian`: the finance contractDate, else today.
  - `contract_city` and `signature_city`: the client's city, else «الرياض».
  - `contract_amount`: `round(grossTotal).toLocaleString("en-US")`.
  - `subject`: the project name.
  - `contract_no`.
  - `currency` ر.س; `duration_months` "12"; `duration_unit` شهر; `payment_method` تحويل بنكي.
- `resolveVariables(stored, ctx)`. Stored values are `manual`. Then:
  - `company_*` tokens always follow the **current** org profile: name, email, phone, website, address, reg, tax,
    signer_name, signer_title, signer_id, bank_name, bank_iban.
  - Computed: `contract_amount_words` (`numberToArabicWords`), `duration_full` («12 شهر»),
    `contract_date_gregorian` (DD/MM/YYYY), `contract_date_hijri` (the manual value or Umm al-Qura),
    `cashback_amount` and `cashback_amount_words`, `letter_date_hijri`, `today_gregorian`, `today_hijri`.
- `VARIABLE_KEY = /^[a-z][a-z0-9_]*$/`. Syntax is `{{key}}`.
  - `unwrapLiteralBraces` turns `{{أبها}}` into `أبها`, because v1 users typed values inside braces.
  - `segments(text, values)` splits text into text parts and `{key, value, empty}` slots.
  - `fillText` leaves empty variables visible as `{{key}}`.
- `formatGregorian(iso)` → `DD/MM/YYYY`. `toHijri(iso)` uses Intl `ar-SA-u-ca-islamic-umalqura-nu-latn` at
  12:00 UTC and returns e.g. «29 جمادى الأولى 1448» (for 2026-11-09), with no era; templates add «هـ».
- `numberToArabicWords(n)` rounds n; if ≤0 it returns "".
  - Scales are مليار, مليون and ألف, each with forms for 1 / 2 / 3–10 / 11+: ألف/ألفان/آلاف/ألفاً,
    مليون/مليونان/ملايين/مليوناً, مليار/ملياران/مليارات/ملياراً.
  - Parts are joined with « و». Within a group, units come before tens («خمسة وأربعون»).
  - Examples: 115000 → «مئة وخمسة عشر ألفاً»; 2345678 → «مليونان وثلاثمئة وخمسة وأربعون ألفاً وستمئة وثمانية وسبعون».
- `renumberClauses(clauses, ordinals)`: only clauses with a `baseTitle` are numbered, as
  «المادة {ordinal}: {baseTitle}».
- `cashbackBody(v1Body, hasAmount)` inserts «قدره {{cashback_amount}} ريال ({{cashback_amount_words}} ريال)».
- Templates (`templates/v1-templates.ts`, copied verbatim from v1, do not hand-edit):
  - `CONTRACT_ORDINALS` runs from الأولى to العشرون (20 entries).
  - `CONTRACT_TEMPLATES`:
    - `service` «عقد تقديم خدمات وتنفيذ مشاريع». Clauses: opening, preamble التمهيد, definitions, subject,
      obligations_a, obligations_b, financial المقابل المالي وشروط الدفع, duration, confidentiality, ip,
      force_majeure, termination, indemnity, disputes, governing_law, notices, general, signatures_note.
    - `nda` «اتفاقية عدم إفصاح وسرية المعلومات».
    - `employment` «عقد عمل».
    - `consulting` «عقد تقديم خدمات استشارية».
    - `blank` «عقد (نموذج فارغ)».
  - `CLAUSE_LIBRARY` (~17 keys, from preamble to signatures).
  - `LETTER_TEMPLATES.cashback` «كاش باك للجمعية من قيمة العقد» (salutation «السلام عليكم ورحمة الله وبركاته، وبعد:»).
- Document lifecycle (schema/migrations): `documents` has kind contract or letter, number, template_key, status
  (draft, review, approved), variables (JSON), content (clauses JSON), layout, version and approval.
  - `document_versions` stores snapshots.
  - Outgoing numbers (`outgoing_no/at/by`, «الصادر») come from migration 0004.
  - `document_shares` holds public share tokens. `status_changed_at` comes from migration 0025.
  - PDFs are rendered by headless Chrome (BROWSER binding).

---------------------------------------------------------------------------------------------------

## 18. Sample data — `v2/tools/migrate/fixtures`

### v1-sample.json (an auth snapshot, shaped like `v1-export.sql`)
```json
users:  [{id:"usr_admin_1", name:"سلطان", email:"Sultan@Example.com", password_hash:"375x4r", role:"admin", must_change_pass:0, created_at:1700000000},
         {id:"usr_2", name:"موظف", email:"staff@example.com", password_hash:"PENDING", role:"user", must_change_pass:1},
         {id:"usr_bad", name:"بلا بريد", email:"", ...}]                       // → rejected (no email)
orgs:   [{id:"org_a", name:"جمعية الأمل", email:"hope@assoc.sa", password_hash:"375x4r", contact_name:"أحمد"},
         {id:"org_b", name:"", contact_name:"", email:"noname@assoc.sa"},        // → rejected «جمعية بلا اسم»
         {id:"org_c", name:"جمعية النور", email:"sultan@example.com", ...}]      // email clashes with usr_admin_1 → login rejected
org_members: [{id:"mem_1", org_id:"org_a", name:"سارة", email:"sara@assoc.sa", role:"admin"},
              {id:"mem_2", org_id:"org_a", name:"خالد", role:"editor"},          // → member
              {id:"mem_3", org_id:"org_zzz", name:"يتيم", ...}]                  // → rejected (org missing)
workspace: "{\"clients\":[{},{},{}],\"projects\":[{},{}],\"settings\":{...},\"templates\":[]}"   // JSON string
```
(`375x4r` is djb2("123"), the v1 hash format.)

### v1-workspace.json (the business blob: clients, projects, fin)
```json
clients: c2 «جمعية البر» type association, reg_no 111, tax_no 300111, contact_name أحمد / الرئيس, notes «عميل قديم», created 2025-03-01
         c1 «شركة الأفق» company, email INFO@ufuq.sa (→ lowercased), city الرياض, created 2025-01-15, logo data:image/png
         c3 «جمعية من المئة يوم» source "100day", contact سارة, note «أُنشئ من خطة المئة يوم»   (100-day variant fields)
         c4 «مكرر السجل» reg_no 111 (duplicate → blanked, "fixed"), type "weird" (→ other)
         c5 name "" (→ rejected)        c6 «شعار ضخم» logo data:image/bmp (→ unsupported, dropped)
projects: p1 «برنامج تدريبي» client c1, training, active, owner usr_admin_1, 2025-02-01..2025-03-01, notes «أ»+note «ب» (joined)
          p2 «فعالية» client c2, event, completed, visibility private, created 2026-01-10, _initial_contract_val "5000"
          p3 «استشارة» c1 consulting paused, start 2025-05-01 end 2025-04-01 (end<start → end blanked)
          p4 «يتيم» client "ghost" (→ rejected, orphan)     p5 «بحالة غريبة» status "done" (→ active, fixed)
fin: { p1: {ctrl:{contract_value:"115,000.50"}},  p2: {ctrl:{}} }   // p1 expected value = 11,500,050 H
```
Codes after migration, ordered by `created` and then original position:
c1 → CL-0001, c2 → CL-0002, c3 → CL-0003, c4 → CL-0004, c6 → CL-0005.
Projects: p1 → PRJ-2025-0001, p3 → PRJ-2025-0002, p5 → PRJ-2025-0003, p2 → PRJ-2026-0001.

### Full v1 project fin shape (`workspace.fin[pid]` or localStorage `buad2_fin_<pid>`)
```js
{ ctrl: { contract_no, contract_date, contract_value, cv_locked, vat_included, vat_pct,
          exec_v/_type/_base, mkt_v/_type/_base, mkt_internal, cb_v/..., cf_v/..., op_cats[],
          custom_cats:[{id,label,type:"expense"|"income"|"both"}] },
  budget: [{name, amount, note}],                                   // positional; entries use cat "bdg_<index>"
  entries:[{id, date, desc, cat, type, amount, profit_margin, profit_margin_type, status, note}],
  contracts:[...], letters:[...] }                                   // documents (doc_style, header/footer/stamp images)
```
v1 company finance `buad2_pf` has these lists:
- `income[]` and `expenses[]`: `{id, category, date, payment_date, desc, amount, note, project_id?}`.
- `partners[]`: `{id, name, share_pct, note}`.
- `distributions[]`: `{id, period_type, period_label, from_date, to_date, gross_income, gross_expenses, net_profit,
  distribution_pct, distributed_amount, retained_amount, retained_category, project_ids, status, created_at, shares}`.

### Realistic records for a prototype (consistent with the rules above)
| Entity | Example |
|---|---|
| Org | «بُعد» (org_platform), «جمعية الأمل» |
| Client | CL-0002 «جمعية البر الخيرية بأبها», association, reg 1000714900, tax 300111222200003, city أبها |
| Project | PRJ-2026-0004 «ملتقى صيادلة عسير», event, active, contract 115,000 incl. VAT 15%, exec 10% net |
| Receipts | 2026-02-10: 57,500 R (first instalment of 50%); 2026-04-12: 57,500 R |
| Partners | سلطان 50%, شريك 30%, شريك 20% → 100,001 H splits 50,001/30,000/20,000 |
| Quote | QT-2026-0012, 3 × 333.33 SAR, discount 50 SAR, VAT 15% → total 1,092.49 SAR |

---------------------------------------------------------------------------------------------------

## 19. Migrate tool (`v2/tools/migrate`, `@buad/migrate`): v1 → v2, one-way

The tool never connects to v1. It reads one JSON file and writes `import.sql` (idempotent) and `report.md`
(rejections listed by name).
- CLI: `pnpm --filter @buad/migrate plan <v1-snapshot.json> <out-dir>` (`tsx src/cli.ts`). It prints
  `orgs=… users=… rejected=…`.
- `bootstrap-owner` script (`src/bootstrap-owner.ts`) creates the first owner from the CLI, as an alternative to `/setup`.
- `v1-export.sql` holds the read-only queries to run against the v1 D1 (`buad-platform`):
  `SELECT … FROM users / orgs / org_members; SELECT id,data,updated_at FROM workspace WHERE id='main'`.
- The API also imports in-app (`modules/importer.ts`, «الاستيراد», permission `import.run`). It uses
  `parseV1Export`, which accepts:
  - the v1 «الإعدادات ← تصدير البيانات» file, whose `buad2_*` values are JSON strings;
  - a raw `{clients, projects, fin}`;
  - a `{workspace}` snapshot.

  `selectClients` imports chosen clients with their projects and fin. Company finance always comes along.
  `previewClients` ranks the clients that are best to try first. `completeness(client)` gives a 0–100 fill score.

Mapping rules (`plan.ts`, `business.ts`, `finance-plan.ts`, `company-plan.ts`, `documents-plan.ts`, `sql.ts`):

| v1 | v2 |
|---|---|
| `users` (platform staff) | users in org `org_platform` («بُعد»). Role admin→admin, anything else→member |
| `orgs` (association logins) | one org each (name = name ‖ contact_name, or rejected if both are empty), plus user `own_<orgId>` with role **owner** |
| `org_members` | users in their org (admin→admin, else member). Rejected if the org is unknown |
| email | trimmed and lowercased, must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, must be unique across all three kinds (first wins; the rest are rejected «البريد مكرر مع السجل …») |
| password `djb2` hash | `legacy_hash`. It is verified once at first login and then upgraded to PBKDF2. Empty or `djb2("__pending__"+id)` or must_change → `must_change_pass=1`, hash "" |
| `djb2(s)` | `h=5381; h=(h<<5)+h+charCode; (h>>>0).toString(36)` |
| workspace.clients | `clients` keeps its **original id**, gets code CL-NNNN by creation order, name_norm, email lowercased. A bad type becomes other (empty → company). A duplicate reg or tax is blanked (fixed). A logo must be a png/jpeg/webp/svg data URL of ≤280,000 chars. `notes` = notes + note (100-day path). Contact `contact_name‖contact` + `contact_title` → `client_contacts` `con_<id>` with is_signatory |
| workspace.projects | keeps its id, gets number PRJ-<year of created‖start>-NNNN with a per-year sequence. Type outside {training, consulting, event, other} → other. Status outside {draft, active, completed, paused, cancelled} → active. End before start → end blanked. `visibility` private or team. `expected_value_halalas` = fromRiyals(fin.ctrl.contract_value ‖ _initial_contract_val), with commas stripped. Orphans are rejected |
| counters | `org_counters` set to the highest imported value (client year 0, project per year), so new numbers continue after them |
| fin[pid] | `project_finance` + `finance_entries` (id `v1_<pid>_<entryId>`, desc → description or «(بدون وصف)», `bdg_<i>` → `bdg_bud_<pid>_<i>`, note «من الاتفاقية» → source agreement) + `finance_budget_items` (`bud_<pid>_<i>`) + `finance_categories` (custom_cats). Money via fromRiyals |
| parity | `financeParity` runs v1 finCalc on the raw data (with cancelled entries removed) against v2 `summarize` on the imported rows over 17 fields. Result is `exact`, `rounding` (within tolerance `0.005*(entries+budget+2)`, same missingItems) or `mismatch` |
| buad2_pf | `company_entries` (skips sync leftovers: rows with a project_id, or income in project_fee; amounts must be > 0; unknown category → other), `partners` (share clamped to 0–100), `distributions` + `distribution_shares` (status completed or draft, pct defaults to 100) |
| fin.contracts / letters | `documents` (kind contract or letter). «المادة …: X» becomes baseTitle X. Layout comes from doc_style. Images (header, footer, stamp) are deduplicated into R2 `assets`. Literal braces are unwrapped |
| SQL | `INSERT … ON CONFLICT(id) DO UPDATE` refreshes data fields only. Codes and numbers are fixed at the first import. A password already upgraded in v2 is never overwritten. `legacy_map(kind, legacy_id, new_id)` records every import |

---------------------------------------------------------------------------------------------------

## 20. Infrastructure (v2)

### Workspace
- pnpm workspace, `packageManager pnpm@10.28.0`, Node ≥ 22. Packages: `apps/*`, `packages/*`, `tools/*`, `e2e`.
  - `apps/web`: React 19, Vite, TanStack Router/Query, Tailwind 4, RTL, IBM Plex Sans Arabic, react-hook-form.
  - `apps/api`: Hono 4 on Workers, zod 4, drizzle-orm 0.45, `@cloudflare/puppeteer` 1.0.4.
  - `packages/domain`.
  - `packages/schema`: Zod + Drizzle. `drizzle.config.ts` uses dialect sqlite and schema `src/db.ts`, and writes to
    `../../apps/api/migrations`. Command: `pnpm --filter @buad/schema db:generate` (drizzle-kit generate).
  - `tools/migrate`.
  - `e2e`: Playwright 1.56.1 + axe-core.
- Root scripts (`v2/package.json`):

| script | command |
|---|---|
| dev:web | `pnpm --filter @buad/web dev` (http://localhost:5173, proxies /api) |
| dev:api | `pnpm --filter @buad/api dev` → `wrangler dev` (:8787) |
| build / typecheck / test | `pnpm -r build` / `pnpm -r typecheck` / `pnpm -r test` |
| lint / format | `biome check .` / `biome check --write .` |
| **verify** | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (the same gate as CI) |
| deploy | `pnpm --filter @buad/web build && pnpm --filter @buad/api deploy` (`wrangler deploy`) |
| deploy:dry | web build plus `wrangler deploy --dry-run --outdir dist` |

- `pnpm.onlyBuiltDependencies` = esbuild, workerd, better-sqlite3. Dev dependencies: Biome ^2.2, TypeScript ~5.9.3.
- `biome.json`:
  - Formatter: 2 spaces, lineWidth 100, double quotes.
  - Linter enabled with `preset: "none"`.
  - Tailwind directives allowed in CSS.
  - Ignores dist, node_modules, .wrangler and the e2e outputs.
- `tsconfig.base.json`: target and lib ES2023, module ESNext, moduleResolution Bundler, strict,
  **noUncheckedIndexedAccess**, noImplicitOverride, verbatimModuleSyntax, isolatedModules, skipLibCheck,
  resolveJsonModule, noEmit. Domain and schema are consumed from source (their `build` scripts are echo).

### Cloudflare (`v2/apps/api/wrangler.jsonc`)
- A single Worker **`buad-v2`** serves `/api/*` and the built SPA. `main src/index.ts`, compatibility_date
  2025-09-01, `nodejs_compat`. Var `APP_VERSION` ("0.0.0"; deploy sets it to the short sha).
- `assets`: directory `../web/dist`, binding `ASSETS`, `not_found_handling: single-page-application`,
  `run_worker_first: ["/api/*", "/site", "/site/*"]`. `/site*` goes through the Worker only to add link-preview
  meta tags.
- **D1**: binding `DB`, database_name `buad-v2`, **database_id `33b6bb7c-c22c-4796-892a-ac0e94a024d2`**,
  migrations_dir `migrations`.
- **R2**: binding `FILES`, bucket `buad-v2-files`. It holds logo, stamp, signature, letterheads and document images.
  `assets` rows store sha256, mime, size and r2_key, and are deduplicated by hash.
- **Browser**: binding `BROWSER` (Browser Rendering / headless Chrome) for vector PDFs of documents and reports.
- **Rate limit**: `LOGIN_LIMITER`, namespace_id "1001", 10 per 60 s per address. Beyond that the response is 429.
- `observability.enabled = true` (Workers Logs).
- Secrets (never in the file): `JWT_SECRET` (required, no default) and the optional `OWNER_SETUP_TOKEN`.
- Same origin means a cookie session works: `HttpOnly; Secure; SameSite=Strict`, 12 h, revoked by bumping
  `users.token_version`. `requireAuth` also accepts `Authorization: Bearer` (relevant for iOS).
  Passwords use PBKDF2-SHA256 with a random salt. `/setup` (one-time first owner) returns 404 without the token
  and 409 once an owner exists; the password must be at least 12 characters. Recovery key: `users.recovery_hash/at`
  (migration 0032).
- No domain is hard-coded: the web app calls `/api` relatively. Default URL:
  `https://buad-v2.<account>.workers.dev`.

### GitHub Actions
**`v2-ci.yml`**
- Triggers: push or PR touching `v2/**` or the workflow file. Runs on `ubuntu-24.04` (pinned because Playwright 1.56
  cannot install Chromium on 26.04). Working directory `v2`.
- Steps:
  1. checkout@v4
  2. pnpm/action-setup@v4 (package_json_file v2/package.json)
  3. setup-node@v4 with Node 22 and the pnpm cache
  4. `pnpm install --frozen-lockfile`
  5. **`pnpm verify`**
  6. `pnpm --filter @buad/e2e exec playwright install --with-deps chromium`
  7. `pnpm --filter @buad/e2e e2e`
  8. On failure, upload the `e2e-report` artifact (playwright-report and test-results, 7 days).

**`v2-deploy.yml`**
- Triggers: `workflow_dispatch`, or push to `main` touching `v2/**` or the workflow file.
  `concurrency: v2-deploy` (no cancel). Runs on ubuntu-24.04.
- Secrets: **`CLOUDFLARE_API_TOKEN`** (Workers Scripts:Edit + D1:Edit), **`CLOUDFLARE_ACCOUNT_ID`**,
  **`JWT_SECRET`** (≥32 chars), and the optional **`OWNER_SETUP_TOKEN`** (≥32 chars).
- Steps:
  1. checkout, pnpm, node 22, install, `pnpm verify`.
  2. `pnpm --filter @buad/web build` with `VITE_APP_VERSION=${{github.sha}}`, so an open browser can offer a reload.
  3. Install Playwright Chromium and run e2e. **Nothing deploys unless e2e passes on this build.**
  4. Back up the DB: `wrangler d1 export buad-v2 --remote --output ../../backup-<sha7>.sql`, then upload the artifact
     `d1-backup-<sha>` (30 days, error if missing).
  5. `wrangler d1 migrations apply buad-v2 --remote`.
  6. `printf "$JWT_SECRET" | wrangler secret put JWT_SECRET`.
  7. If set: `wrangler secret put OWNER_SETUP_TOKEN`.
  8. `wrangler deploy --var "APP_VERSION:<sha7>"`.
- Restore options:
  - D1 Time Travel: `wrangler d1 time-travel info|restore buad-v2 --timestamp=…`. Retention is 30 days on paid
    plans and 7 on free.
  - From a backup file: `wrangler d1 execute <new-db> --remote --file=backup-<sha>.sql`.

### Testing
- **vitest** ^3.2 in each package (`vitest run`, default config, no config files).
  - `packages/domain/*.test.ts`: pure unit tests plus the v1 parity test.
  - `packages/schema/schema.test.ts`.
  - `tools/migrate/*.test.ts`: migrate, business, finance-plan, company-plan, documents-plan, v1-export, bootstrap.
  - `apps/web` has component tests and `design-rules.test.ts`, which bans raw colours/hex and text under 12px.
  - `apps/api/src/*.test.ts` has about 35 suites, e.g. finance, vat, company, receivables, year-review, team,
    roles, recovery and safety.
- **`apps/api/src/test-db.ts`**: `testDb()` = an in-memory better-sqlite3 database with `PRAGMA foreign_keys = ON`,
  which applies every `migrations/*.sql` in sorted order, split on `--> statement-breakpoint`, and wraps it as
  `drizzle(sqlite)`.
  - API tests use `createApp({ getDb: () => ctx.db })`, then `app.request(path, {method, headers:{cookie}}, env)` with
    `env = {APP_VERSION:"t", JWT_SECRET:"test-secret-at-least-16-chars"}`.
  - Fixture orgs are o1 «بُعد» and o2 «أخرى». Users are admin, member and a foreign owner. Tests include org
    isolation.
- **e2e** (`v2/e2e`):
  - `serve.sh` deletes `.state`, runs `wrangler d1 migrations apply buad-v2 --local --persist-to .state`, then
    `wrangler dev --local --port 8788` with test-only `--var` values for OWNER_SETUP_TOKEN and JWT_SECRET.
  - Playwright: workers 1, not fully parallel, 1 retry on CI, 60 s timeout, locale ar-SA.
    `globalSetup` creates the owner via `/setup` and stores the state in `.auth/owner.json`.
    Projects are `desktop` (1440×900) and `phone` (Pixel 7). The webServer health URL is `/api/health`.
  - Specs: a11y (axe, WCAG 2.1 A/AA, light and dark), clients, documents, finance, meetings, palette, recovery,
    roles, smoke (phone checks: no horizontal scroll, no text under 12px, no raw dates; 11 pages) and tasks.
  - Each test creates its own uniquely named data.

### Migrations (`v2/apps/api/migrations`, drizzle-kit generated, 33 files, plus `meta/NNNN_snapshot.json`)
| # | Adds |
|---|---|
| 0000 | `legacy_map` (kind, legacy_id, new_id, imported_at); `orgs` (id, name, created_at); `users` (org_id, email unique, name, password_hash, legacy_hash, must_change_pass, token_version, role) |
| 0001 | `clients` (code, name, name_norm, type, email, phone, city, reg_no, tax_no, address, website, notes, logo, audit cols, archived_at; unique code, reg, tax per org); `client_contacts` (is_signatory); `org_counters` (org_id, kind, year → value); `projects` (number unique, client_id, type, status, owner_id, visibility, location, start, end, pay_date, expected_value_halalas, archived_at, archived_with) |
| 0002 | Project finance: `project_finance` (contract_no/date, contract_value_halalas, cv_locked, vat_included, vat_pct default 15, exec/mkt/cb/cf v/type/base, mkt_internal, op_cats JSON, version); `finance_entries` (date, description, cat, type, amount_halalas, profit_margin(+type), status, note, source); `finance_budget_items`; `finance_categories` |
| 0003 | `assets` (sha256 unique, mime, size, r2_key); `doc_templates`; `documents` (kind, number, template_key, status, variables, content, layout, version, approval); `document_versions`; `org_profile` (identity, signer, bank, logo, stamp, signature, header, footer assets) |
| 0004 | documents `outgoing_no/at/by` (outgoing register «الصادر», unique) |
| 0005 | `document_shares` (public share token per document) |
| 0006 | Company finance: `company_entries`, `partners` (share_pct), `distributions` (period, gross income/expenses, net, pct, distributed, retained, retained_category, project_ids, status, completed_at), `distribution_shares` |
| 0007 | `project_receipts` (date, amount_halalas, note, archived_at); `distribution_projects` (what each distribution took from each project) |
| 0008 | receipts `basis`, `approved_by`, `approved_at` |
| 0009 | `org_vat_settings`; finance_entries `tax_invoice`, `vat_amount_halalas`, `supplier_name`, `supplier_vat_no`, `invoice_no`, `invoice_date` |
| 0010 | `products` (slug unique, name, tagline, status, show_on_site, content JSON, pricing JSON, sort, version) |
| 0011 | `product_requests` (website enquiries/leads: product, source, status, contact, answers, quote, client_id, project_id, ip_hash); `site_settings` (draft, published, version) |
| 0012 | projects `product_id`, `package_id`, `package_name` |
| 0013 | `site_publishes` (publish history) |
| 0014 | `audit_log` (at, user, entity, action, summary, detail); `org_roles` (perms, scopes overrides); `project_members`; users `role_key`, `active`, `last_login_at` |
| 0015 | Plans: `plan_cycles`, `plan_objectives`, `plan_indicators`, `plan_initiatives`, `plan_reviews` |
| 0016 | `notifications` (per user, with a dedupe unique index) |
| 0017 | `project_stages`, `tasks` (stage, initiative, assignee, status, priority, dates, done_at), `time_entries` (minutes) |
| 0018 | product_requests `owner_id`, `follow_up_at`, `value_halalas`, `lost_reason` (CRM pipeline) |
| 0019 | `quotes` (number unique, request, client, recipient, entity, title, items JSON, discount_halalas, vat_pct, valid_until, terms, status, version) |
| 0020 | `payment_schedule` (instalments: label, due_date, amount_halalas, status, receipt_id, received_at) |
| 0021 | `crm_activities` (type, summary, at); clients `owner_id`, `source`, `tags`, `next_follow_up_at`, `last_contact_at` |
| 0022 | quotes `product_id`, `package_id`, `project_id` |
| 0023 | product_requests `package_id`, `stage_changed_at` |
| 0024 | `meetings` (starts_at, duration, location, attendees, links, agenda, minutes, status); `decisions` (owner, due, status, meeting, project, task links) |
| 0025 | documents `status_changed_at` |
| 0026 | indexes: documents (org, status), receipts (org, date) |
| 0027 | `org_settings` (org_id, key → value): numbering prefixes etc. |
| 0028 | `sales_invoices` (number, date, amount, vat, receipt link, asset); `vat_filings` (period_key unique, status, output, input, net, filed_on, paid_on, paid_amount, reference); company_entries tax invoice fields; finance_entries `cf_kind` |
| 0029 | distribution_shares `paid_on`, `paid_ref`; distributions `paid_on`, `paid_by` (the «paid» stage) |
| 0030 | projects `closed_at`, `closed_by`, `close_note` (financial close / lock / reopen) |
| 0031 | projects `external` (external project: tracked as work, never in finance) |
| 0032 | users `recovery_hash`, `recovery_at` (password recovery key) |

Common column pattern: `id text PK`, `org_id`, `created_by`/`created_at (unixepoch())`,
`updated_by`/`updated_at`, `archived_at` (archive instead of delete), and a `version` integer for optimistic
concurrency on documents, finance, products, site and plans. Draft projects stay out of finance (latest commit).

API modules (`apps/api/src/modules`): assets, attention, audit, clients, common, company-finance, crm, documents,
finance-checks, finance-overview, finance, importer, notifications, opportunity, org-export, org, pdf, plans,
products, project-close, projects, quotes, receivables, reports, requests, sales, service-link, settings, share,
site-meta, site-public, site, tasks, team, vat, workspace, year-review.

---------------------------------------------------------------------------------------------------

## 21. v1 — the current production platform (repo root)

### What it is
- «منصة بُعد التمكين» is a static, offline-first HTML/CSS/JS app for **بُعد التمكين للخدمات التنفيذية**, a
  Saudi company that runs projects, events and training for charities («الجهات الخيرية»/«الجمعيات»).
- Hosting: Cloudflare Pages with Pages Functions. Netlify config is also present (`netlify.toml`: publish ".",
  `/app` → `/app.html`, security headers). `_headers` sets X-Frame-Options SAMEORIGIN and nosniff, and no-cache for HTML.
- Data model: **almost all business data is one JSON blob**, `workspace.data` (row id `main`), holding clients,
  projects, fin{pid}, settings and templates. It is mirrored in localStorage:
  - `buad2_clients`, `buad2_projects`, `buad2_fin_<pid>`, `buad2_settings`, `buad2_custom_templates`
  - `buad2_fin_pending`, `buad2_jwt`, `buad2_sb` (sidebar), `buad2_tool_paused`
  - company finance in `buad2_pf`

### Files
| File | Size | Role |
|---|---|---|
| `app.html` | ~1.77 MB, one file | The internal dashboard (`/app`, team only, hash routing). `<title>بُعد — إدارة مالية</title>`. Globals: `DB` (L2567, localStorage/API wrapper), `Auth` (L3193), **`FinCalc` (L3381)**, `Nav` (L3488), `UI` (L3720), `Pages` (L4559, `render_*`) |
| `index.html` | 57 KB | Public landing page «بُعد · شريك الجهات الخيرية في الإدارة والحوكمة والتحول الرقمي». Has the service request form (→ `/api/public/request`) |
| `plan.html` | 674 KB | «بُعد · بوابة الجمعيات», the associations portal for org logins. Sections: خطة المئة يوم (100-day plan, progress), خدمات بُعد لجمعيتك, الموارد والأدلة, فرص المنح والتمويل, ملف الجمعية, الحوكمة والامتثال, إدارة المشاريع مع بُعد, الأدوات والباقات, المهام, الإعدادات, الموقع الإلكتروني (site builder), and CRM for beneficiaries |
| `project-template.html` | 181 KB | A standalone complete project model, «ملتقى الصيادلة» (Asir pharmacists forum). Pages: عرض السعر, عقد ملتقى الصيادلة, التوزيع المالي الداخلي |
| `org-site.html` | 235 KB | Public association website renderer (custom domains via `functions/_middleware.js` and `PLATFORM_HOSTS`; it calls `/api/public/org-site-by-host` or `/api/public/org-site/:id`) |
| `setup-cloudflare.html` | 11 KB | Setup guide for Cloudflare |
| `functions/api/[[all]].js` | 1,521 lines | The whole API as one Pages Function, `onRequest` with if-chains on `path` and `method` |
| `functions/_middleware.js` | — | Custom-domain routing for association sites (opt-in via `PLATFORM_HOSTS`; `*.pages.dev` and localhost are always the platform) |
| `migrations/001–009.sql` | — | v1 D1 schema |

### app.html sidebar (Nav.go keys → labels)
- **القائمة**: `dash` الرئيسية · `clients` العملاء · `projects` المشاريع · `templates` النماذج (contract and letter templates).
- **الموقع**: `website` الطلبات الواردة (incoming requests) · `services` الخدمات والأدوات · `site` إدارة الموقع ·
  `orgs` خطة المئة يوم (associations on the 100-day plan) · `opplan` الخطة التشغيلية · `stratplan` الخطة الاستراتيجية ·
  `governance` الحوكمة والامتثال · `orgsites` مواقع الجمعيات · `resources` الموارد والأدلة · `grants` فرص المنح.
- **الحساب**: `pf` مالية المنصة (company finance) · `settings` الإعدادات (including «تصدير البيانات», the export used by
  the v2 importer).
- Other renderers: `render_client`, `render_contract`, `render_fin` (project finance), `render_template_editor`.
- Company finance (`pf`) tabs: `overview` نظرة عامة, `ledger` المعاملات, `distrib` توزيع الأرباح.
  Helpers: `_pfCalc`, `_pfCalcFull`, `_pfDistribProfit`, `_pfRetainedTotals`, `_pfBankMin`, `_pfCleanSyncArtifacts`,
  `_pfRepairContractValues`, `_pfPeriodRanges`, `_pfDistribNext`, `_pfMonthlyChart`, `_pfCompleteDistrib`.
  v2's `company.ts` ports these.
- Project finance: budget ↔ contract ↔ actual («الميزانية ↔ العقد ↔ المتابعة الفعلية»), agreement items
  auto-entered, contracts and letters (CONTRACT_TEMPLATES L3795–4067), PDF export, «كشف المعاملات» statement.

### v1 auth
- Platform users (`users` table): password `djb2(pass)` (base-36), JWT HS256 valid **30 days** stored in
  localStorage `buad2_jwt`. `JWT_SECRET` falls back to a dev default.
- `must_change_pass` triggers a setup token (`action:'setup'`) → `/auth/setup-pass`.
- Associations log in via `/org/login` (orgs table) and their members via `org_members`. Admin-only routes check
  `role === 'admin'`. CORS is `*`.
- The initial migration seeds one admin with a weak default password. Treat it as a known v1 weakness;
  v2 upgrades passwords to PBKDF2.

### v1 API routes (`/api` prefix; the path is normalised without a trailing slash)
| Area | Routes |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/setup-pass`, `GET /me` |
| Public | `GET /public/asset/:id`, `GET /public/org-site-by-host`, `GET /public/org-site/:id`, `GET /public/site`, `GET /public/resources`, `POST /public/request` (service request), `GET /public/grants` |
| Association portal | `POST /org/register`, `POST /org/login`, `GET /org/me`, `PUT /org/progress` (100-day progress), `GET/POST /org/tasks`, `PUT/DELETE /org/tasks/:id`, `PUT /org/profile`, `GET/POST /org/members`, `DELETE /org/members/:id`, `POST /org/change-password`, `GET/PUT /org/website`, `POST /org/request`, `GET /org/requests` |
| Association CRM (beneficiaries) | `GET/PUT /crm/config`, `GET /crm/dashboard`, `GET/POST /crm/beneficiaries`, `GET/PUT/DELETE /crm/beneficiaries/:id`, `PATCH /crm/beneficiaries/:id/stage`, `GET/POST /crm/documents`, `PATCH/DELETE /crm/documents/:id`, `GET /crm/requests/:id/detail`, `POST /crm/requests/:id/action`, `GET /crm/reports`, `GET/POST /crm/requests`, `PATCH/DELETE /crm/requests/:id`, `POST /crm/aids`, `DELETE /crm/aids/:id`, `POST /crm/notes`, `DELETE /crm/notes/:id` |
| Admin | `POST /admin/run-migrations` (in-code CREATE/ALTER, e.g. grant_opportunities, orgs logo_url/banner_url, service_requests org_id/client_note), `POST /admin/asset`, `DELETE /admin/asset/:id`, `GET/PUT /admin/org-website/:orgId`, `GET /orgs`, `PATCH /orgs/:id/toggle-website`, `PATCH /orgs/:id/toggle-crm`, `POST /admin/enable-tool`, `DELETE /orgs/:id`, `GET/PUT /site`, `GET/POST /admin/grants`, `PUT/DELETE /admin/grants/:id`, `GET/PUT /resources`, `GET /requests`, `PUT/DELETE /requests/:id` |
| Workspace | `GET /workspace` (the whole blob), `PUT /workspace` (replaces the blob and strips `users`), **`PUT /fin/:projectId`** (server-side merge of one project's fin, so concurrent editors of different projects do not clobber each other) |
| Users | `GET/POST /users`, `GET /users/:id/invite`, `PUT/DELETE /users/:id` |

Assets are stored base64 in D1 (`org_assets`), with a maximum of 800 KB raw (no R2 in v1).

### v1 D1 tables (`migrations/*.sql`, binding `BUAD_DB`, database `buad-platform`)
| Migration | Tables / columns |
|---|---|
| 001_initial | `users` (id, name, email NOCASE unique, password_hash, role default 'user', must_change_pass, created_at); `workspace` (id 'main', data JSON, updated_at) |
| 002_site | `site_content` (id, data, updated_at; ids like 'resources'); `service_requests` (name, org, phone, email, service, budget, message, status, notes, assignee, source) |
| 003_orgs | `orgs` (association accounts: name, email, password_hash, contact_name, phone, city, license_no, plan_start, progress, last_active) |
| 004_org_websites | orgs `website_enabled`; `org_websites` (org_id, config, published, published_at, custom_domain) |
| 005_crm | orgs `crm_enabled`; `beneficiaries` (id_number, dob, gender, contact, address, marital_status, dependents, housing_type, income, employment_status, category, status); `crm_requests` (service_type, amount, status, priority, assigned_to, due_date, resolution); `crm_aids` (aid_type, amount, items, provided_at); `crm_notes` |
| 006_crm_config | `crm_config`; beneficiaries `custom_data`; `org_members` (association team) |
| 007_crm_workflow | beneficiaries `stage`, `stage_note`, `assigned_to`; crm_notes `internal`, `stage`; crm_requests `stage`; `crm_documents` (doc_type, status, file_url, verified); `crm_approvals` (stage, action, from/to status) |
| 008_org_site_domain | `org_websites` (re-create with custom_domain) |
| 009_assets | `org_assets` (owner_id, filename, mime, size, data base64) |
| in-code | `grant_opportunities` (+ logo_url, brand_color), `tasks` (org tasks) |

### Relationship v1 ↔ v2
- v2 (`v2/`) is a **separate project**. It never reads or writes v1. Data moves **one way** via `tools/migrate`
  (snapshot JSON → SQL) or the in-app importer, using the v1 «تصدير البيانات» file.
- v1 keeps running at the repo root. v2 runs as its own Worker `buad-v2` with its own D1 `buad-v2` and R2.
- v2 currently covers the business side of `app.html`:
  - clients, projects, project finance, documents, company finance (partners and distributions), VAT, receivables;
  - products/services with pricing, the public site with incoming requests, sales/CRM and quotes;
  - plans, tasks, meetings and decisions, team, roles and audit.

  v1's association portal (`plan.html`: 100-day plan, beneficiary CRM, org sites, grants) is **not** in the
  v2 migrations so far. The "associations" metric suggests associations are now modelled as clients.
- v2 keeps v1 labels and flow on purpose: «نفس تسلسل v1 ونفس الحقول والمسميات». Same order:
  العملاء ← عميل جديد ← صفحة العميل ← مشروع جديد ← صفحة المشروع. v2 also keeps v1 numbers: finCalc is ported
  exactly and checked by parity tests.

---------------------------------------------------------------------------------------------------

## 22. Rules and conventions (v2/README.md, docs, git history)

Hard rules (README «قواعد»):
1. **Money is integer halalas only** (`@buad/domain`). Riyals exist only at the edges (input/display) and inside the
   v1-port calculators, which take R and are converted by `toFinInput`.
2. **A module moves to v2 only after a parity test** shows its numbers match v1 on real data
   (`fincalc.parity.test.ts`, `financeParity` in the importer).
3. **No edits to any file outside `v2/`** from this project. v1 is frozen as far as v2 work is concerned.

Further conventions:
- Every query is scoped to the user's `org_id` (test «isolates organisations»).
- Archive instead of delete. Archiving a client archives its projects (`archived_with`), and restoring the client
  restores only those. Permanent delete is owner-only and only for a client with no projects.
- Clients: reg_no and tax_no are unique within the org. A similar name (normalizeName) warns but is allowed.
- Project visibility matches v1: a manager sees everything; others see their own projects, the team's and
  unassigned ones (scopes all/team/mine).
- Pure domain functions take `today` or `now` as parameters so they are deterministic. Insights return codes, and
  the UI words them.
- Suggestions (receipt dates) are never stored until a person approves them. Nothing invents a figure: missing
  costs give `needs_costs`, not zero.
- Draft and external projects stay out of finance.
- Design (`v2/docs/DESIGN.md`):
  - Tokens: brand; an orange accent; surface/canvas; ink/muted/line; success/warning/danger with
    `-soft`/`-ink`/`-line`; `rounded-card` and `rounded-control`; `shadow-card` and `shadow-raised`.
  - No raw colours or hex in pages; slate is allowed. Dark mode comes from the tokens.
  - One shared component per case: PageHeader (one primary action, the rest under «⋯»), StatTile, Segmented, Pills,
    LayoutToggle, FilterBar (bottom sheet on phones), DataTable (cards on phones), Dialog, confirmAction (the button
    names the action), toast, Notice, EmptyState, Skeleton, SectionBoundary, Badge, Stamp.
  - Page state (tab, filters, period) lives in the URL.
  - No text under 12px and touch targets of at least 44px. No horizontal scroll.
  - Dates are shown in Arabic format via `day()`; raw `YYYY-MM-DD` is never shown. Money via `sar()` and
    `moneyShort()` with tabular numbers.
  - A11y: every control is named, works by keyboard, and pages have a skip link.
  - Every export or print is audited.
- iOS plan (`v2/docs/ios-plan.md`):
  - React Native + Expo in `v2/apps/mobile`, using the same server, D1 and R2.
  - Reuse `@buad/domain`, `@buad/schema` and `hono/client` (`AppType` from `@buad/api/app`).
  - Bearer auth is already accepted.
  - Phone tabs follow `PHONE_CORE = home, sales, projects, finance` (from `features/more/tabs.ts`).
- Commit style (`git log --oneline -40`):
  - Short imperative or descriptive subject, mostly **English with a `v2:` prefix**, e.g.
    «v2: draft projects stay out of finance, and «تحتاج تدخلك» lists them», «v2: password recovery key — …».
  - Some subjects are fully Arabic, e.g. «v2: خطة تطبيق iOS على نفس الخادم وقاعدة البيانات» or
    «إصلاح روابط بقيم غير معروفة…».
  - Plan-phase codes in place of or after the prefix: `F2:`, `F3:`, `F3 (wip):`, `F4:`, `G1:`, `G2+G3:`, `H1:`,
    `v2 (D2):`, `v2 (D3):`.
  - Other prefixes: `ci:` and `e2e:`.
  - Arabic UI terms are quoted in «…». Migration numbers are cited when relevant («(migration 0028)»).
  - Work lands through PRs from `claude/fix-dashboard-header-Kntzj`, merged as «Merge pull request #NNN …».
  - Recent arc: F (finance tabs → VAT year → profit/distribution) → G (closing projects, past distributions,
    purchase invoice) → H1 (speed: bulk finance loading, one VAT pass for the year) → D2/D3 (design system guards)
    → recovery key → iOS plan.
