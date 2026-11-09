# بُعد (Buad) v2 — Data model, enums, API, permissions, auth, business rules

Source: `v2/packages/schema/src/*` (Drizzle on Cloudflare D1/SQLite + zod inputs), `v2/apps/api/src/app.ts`,
`v2/apps/api/src/modules/*`, `v2/apps/api/src/auth/*`, `v2/packages/domain/src/*` (pure rules).
Backend = Hono on Cloudflare Workers; R2 for files; Browser Run for PDFs. UI is Arabic, RTL.

## 0. Global conventions

| Topic | Rule |
|---|---|
| Money in DB | **Integer halalas** (1 SAR = 100 halalas). Columns end `_halalas`. |
| Money over the API | Inputs are **riyals as typed** (floats). Responses are mostly **riyals** (`/100`); some list fields stay halalas (noted per route: e.g. `projects.list.contractTotal`, `received`, `expectedValue`, finance `entries[].amount`, `quote.totalHalalas`). `fromRiyals` rounds half away from zero. |
| Dates | Business dates are ISO text `YYYY-MM-DD` ("" = unset). Meetings use local `YYYY-MM-DDTHH:mm`. |
| Timestamps | Integer epoch **seconds** (`created_at`, `updated_at`, `archived_at`, `approved_at`…). |
| IDs | Text `prefix_<20 hex>`: `cli` client, `con` contact, `prj` project, `ent` entry, `bud` budget item, `cc_xxxxxxxx` custom category, `rcp` receipt, `psc` schedule line, `qte` quote, `req` request, `act` CRM activity, `ntf` notification, `dv` doc version, `vfl` VAT filing, `usr_owner_<uuid>` first owner. Org of the single tenant = `org_platform`. |
| JSON columns | Stored as TEXT (`tags`, `items`, `content`, `pricing`, `variables`, `perms`…). |
| Multi-tenant | Every row carries/derives `org_id`; every query scoped by caller's org. Foreign/missing ids → 404 (never 403, to prevent probing). |
| Response envelope | Success `{ ok: true, ... }`; failure `{ ok: false, error: "<code>", ...extra }`. 401 `unauthorized`, 403 `forbidden`, 404 `not_found`, 409 conflicts, 500 `internal_error`. |
| Archive vs delete | Most records archive (`archived_at` set) instead of delete. Permanent delete is owner-only and guarded. |
| Optimistic locking | `version` integer on project_finance, documents, products, site_settings, org_profile, plan_cycles, quotes. Stale save → 409 `stale` / `version_conflict` with current `version`. |
| Audit columns | `created_by, created_at, updated_by, updated_at, archived_at` (the "audit" mixin) on clients, projects, doc_templates, documents, company_entries, partners, distributions, project_receipts, sales_invoices, vat_filings. |
| Activity log | Middleware `auditTrail` writes every POST/PATCH/PUT/DELETE under `/api/*` into `audit_log` (entity/noun/verb in Arabic, field-level before/after for money records). |

---

## 1. Database tables (Drizzle `db.ts`)

Types: `text`, `int` (integer), `real`, `bool` (integer 0/1). Defaults in parentheses. PK bold.

### 1.1 Identity & system

**orgs** — tenant.
| col | type | notes |
|---|---|---|
| **id** | text | `org_platform` |
| name | text | "بُعد" on setup |
| created_at | int | |

**users**
| col | type | notes |
|---|---|---|
| **id** | text | |
| org_id | text → orgs | idx |
| email | text UNIQUE | lower-cased |
| name | text ("") | |
| password_hash | text ("") | `pbkdf2$100000$salt$hash`; "" until set |
| legacy_hash | text ("") | v1 djb2 hash; upgraded+cleared at first login |
| must_change_pass | bool (false) | true = invited, awaiting first password (cannot log in) |
| token_version | int (0) | bumped on password change / logout-others / deactivate → invalidates JWTs |
| role | enum owner/admin/member ("member") | legacy role; kept in sync (owner→owner, general-manager→admin, else member) |
| role_key | text ("") | role from registry/org_roles; "" = derive from legacy role |
| active | bool (true) | deactivated cannot sign in |
| last_login_at | int (0) | |
| recovery_hash | text ("") | hash of offline recovery key |
| recovery_at | int null | when key created |
| created_at | int | |

**legacy_map** (PK kind+legacy_id) — v1→v2 id mapping: `kind, legacy_id, new_id, imported_at`.

**org_counters** (PK org_id+kind+year) — sequential numbering: `kind` (project/client/quote/doc_contract/doc_letter/outgoing), `year` (0 when not yearly), `value` (last used). Atomic UPSERT…RETURNING.

**org_roles** (PK org_id+key) — org edits of built-in roles or custom roles: `name, description, perms (JSON string[]), scopes (JSON {projects?: all|team|mine}), updated_by, updated_at`.

**org_settings** (PK org_id+key) — key→JSON value. Keys: `project_defaults`, `target:<YYYY>` (riyals), `cash_opening` ({amount,date}), `distribution_defaults` ({pct, retainedCategory}), `numbering` ({kind: prefix}), `doc_texts` ({quoteTerms, quoteValidityDays, letterClosing}).

**audit_log** — `id, org_id, at, user_id, user_name (copied), entity, entity_id, action, summary (Arabic), detail (JSON; may hold changes[{field,label,before,after}])`. idx (org,at), (org,entity,entity_id).

**notifications** — `id, org_id, user_id → users (cascade), kind, title, link, dedupe_key (unique per user when ≠ ""), read_at (0 = unread), created_at`. Kinds used: approval, client, meeting, decision, task, …

**assets** — R2 files, deduped per org by sha256: `id, org_id, sha256 (uq org+sha), mime, size, r2_key, created_by, created_at`. Allowed MIME: png, jpeg, webp, svg+xml, pdf; max 2 MB.

### 1.2 Clients

**clients**
| col | type | notes |
|---|---|---|
| **id** | text | |
| org_id | text | |
| code | text | `CL-0001` (uq org+code), not yearly |
| name | text | required |
| name_norm | text | normalized name for "similar name" warning |
| type | enum CLIENT_TYPES ("company") | |
| email, phone, city, reg_no, tax_no, address, website, notes | text ("") | reg_no (CR / السجل التجاري) and tax_no (VAT no.) unique per org when ≠ "" (archived included) |
| logo | text ("") | inline data URL (png/jpeg/webp/svg base64, ≤ ~200 KB); served at `/api/clients/:id/logo?v=updated_at` |
| owner_id | text ("") | CRM account owner (user id) |
| source | text ("") | "", site, referral, event, call, social, other |
| tags | text JSON ("[]") | ≤10 tags of ≤24 chars |
| next_follow_up_at | text date ("") | |
| last_contact_at | int (0) | |
| audit mixin | | archived_at null = live |

**client_contacts** — `id, client_id → clients, name, title, phone, email, is_signatory (bool; at most one = authorised signatory «المفوّض بالتوقيع»)`.

**crm_activities** — logged contacts: `id, org_id, client_id → clients (cascade), request_id (""), type enum [call, meeting, visit, email, whatsapp, note, stage], summary, at (epoch), created_by, created_by_name, created_at`. `stage` rows are system-written when an opportunity moves stage.

### 1.3 Projects & delivery

**projects**
| col | type | notes |
|---|---|---|
| **id** | text | |
| org_id, client_id → clients | text | |
| number | text | `PRJ-2026-0001` (uq org+number), yearly sequence |
| name | text | |
| type | enum PROJECT_TYPES ("other") | |
| status | enum PROJECT_STATUSES ("active") | draft/active/completed/paused/cancelled |
| owner_id | text ("") | creator; used by visibility |
| visibility | enum team/private ("team") | |
| location | text | |
| start_date, end_date, pay_date | text date | end ≥ start enforced |
| expected_value_halalas | int (0) | «قيمة العقد المتوقعة», pre-VAT; finance contract value takes over |
| notes | text | |
| product_id, package_id, package_name | text ("") | linked service + package (name snapshot) |
| closed_at | int null | financially closed → money records locked |
| closed_by, close_note | text | |
| external | bool (false) | «مشروع خارجي»: work only, never in any financial figure |
| audit mixin | | |
| archived_with | text ("") | client id when archived together with its client |

**project_members** (PK project_id+user_id, cascade) — who is on a project (`added_at`). Grants visibility.

**project_stages** — delivery phases: `id, org_id, project_id (cascade), title, status todo/doing/done, due_date, sort, source manual/product` (product = copied from service workflow).

**tasks** — `id, org_id, project_id ("" = company task), stage_id, initiative_id (plan link), title, description, assignee_id, status todo/doing/blocked/done, priority low/normal/high ("normal"), start_date, due_date, done_at (0), created_by, created_at, updated_at`.

**time_entries** — hours logged: `id, org_id, task_id (cascade), project_id, user_id, date, minutes (1..1440), note, created_at`. Informational; never enters project finance.

### 1.4 Project finance

**project_finance** (PK project_id; one row, created on first save; absent = defaults) — «إعدادات العقد / مركز التحكم»
| col | type | notes |
|---|---|---|
| project_id → projects, org_id | text | |
| contract_no, contract_date | text | |
| contract_value_halalas | int | |
| cv_locked | bool | locks contract value |
| vat_included | bool (false) | contract value already includes VAT |
| vat_pct | real (15) | |
| exec_v/exec_type/exec_base | real, pct\|fixed, net\|gross | «أتعاب التنفيذ» execution fee (company's fee) |
| mkt_v/mkt_type/mkt_base, mkt_internal (bool) | | marketing; internal marketing counts as company profit |
| cb_v/cb_type/cb_base | | cashback «كاش باك» |
| cf_v/cf_type/cf_base | | additional fees «رسوم إضافية» |
| op_cats | text JSON ("[]") | categories counted as operating expenses; empty = salary, logistics, materials, other |
| version | int (1) | optimistic lock |
| created/updated by/at | | |
Fee values: percent when type=pct (≤100), riyals when fixed. Base: % of net (pre-VAT) or gross.
Built-in defaults (v1): vatIncluded false, vat 15, exec 10% gross, mkt 0% gross, cb 0% gross, cf 0% net, mktInternal false.

**finance_entries** — project expense/income lines
| col | type | notes |
|---|---|---|
| id, org_id, project_id | text | idx (project,date) |
| date | text | defaults to today |
| description | text | required |
| cat | text ("other") | built-in key, custom category id (`cc_…`), or budget row `bdg_<budgetItemId>` |
| type | income\|expense | |
| amount_halalas | int | > 0 |
| profit_margin, profit_margin_type | real, pct\|fixed | margin earned on an expense (adds to profit) |
| status | "" \| paid \| pending \| cancelled | cancelled never counts anywhere |
| note | text | |
| tax_invoice | bool | purchase with supplier tax invoice → claimable input VAT (expenses only) |
| vat_amount_halalas | int | stored once (default = amount × rate/(100+rate)); never recomputed |
| supplier_name, supplier_vat_no, invoice_no, invoice_date | text | |
| cf_kind | "" \| vat \| fee | for `cf` entries: contract VAT held for ZATCA vs a real fee |
| source | manual \| agreement | agreement = auto-registered from contract terms |

**finance_budget_items** — `id, project_id, name, amount_halalas, note, sort`.
**finance_categories** — custom per-project categories: `id (cc_…), project_id, label, type expense/income/both`.

**project_receipts** — money received from the client (instalments; negative = refund)
`id, org_id, project_id, date (decides the quarter), amount_halalas (±), note, basis (where the date came from), approved_by, approved_at (null = unapproved → counts nowhere), audit mixin`.

**payment_schedule** — expected instalments «جدول الدفعات / التحصيل»
`id, org_id, project_id (cascade), label, due_date, amount_halalas (gross), status pending/received/cancelled, receipt_id, received_at (date), created_by, created_at`.

**sales_invoices** — tax invoices issued to clients (output VAT by their date)
`id, org_id, project_id, receipt_id, number, date, amount_halalas (incl. VAT), vat_halalas, asset_id (PDF/image), note, audit mixin`.

### 1.5 Documents

**doc_templates** — org's own templates: `id, org_id, name, kind contract/letter, body JSON {clauses, customVars, layout}, audit mixin`.

**documents** — contracts & letters of a project
| col | type | notes |
|---|---|---|
| id, org_id, project_id | text | |
| kind | contract\|letter | |
| number | text | `CT-2026-0001` / `LT-2026-0001` (uq org+number; editable while draft) |
| title, template_key | text | |
| status | draft\|review\|approved ("draft") | |
| variables | JSON {name: value} | |
| content | JSON clauses `[{id,key,title,baseTitle,content,pageBreak}]` (letters keep body here) | |
| layout | JSON (fontSize 13, lineHeight 1.9, titleSize 20, clauseTitleSize 14, marginX 2.2, showHeader/Footer/Signatures, useOrgSignature/Stamp, footerLabel ""\|سري\|مسودة\|نسخة طبق الأصل\|نهائي, header/footer/stamp asset) | |
| version | int | |
| approved_by, approved_at | | |
| outgoing_no, outgoing_at, outgoing_by | | «صادر» register no. `ص-2026-0001`, unique, given once after approval |
| status_changed_at | int | |
| audit mixin | | |

**document_versions** — immutable snapshot at each approval: `id, document_id, version, snapshot (JSON {document, values}), approved_by, approved_at`.

**document_shares** — external read-only links: `id, org_id, document_id, token_hash (SHA-256, unique), channel (whatsapp/email/link), created_by, created_at, expires_at (7 or 30 days), revoked_at, views, last_viewed_at`.

### 1.6 Organisation profile & VAT

**org_profile** (PK org_id) — letterhead identity: `name, email, phone, website, address, reg (CR), tax (VAT no.), signer_name, signer_title, signer_id, bank_name, bank_iban, logo_asset, stamp_asset, signature_asset, header_asset, footer_asset, version, updated_by, updated_at`. API adds `urls{field: assetUrl}`.

**org_vat_settings** (PK org_id) — `rate real (15)` (applies to NEW purchases only), `period quarterly|monthly`.

**vat_filings** — per-period return: `id, org_id, period_key "2026-Q3" (uq), status open/filed/paid, output_vat_halalas, input_vat_halalas, net_halalas (frozen at filing), filed_on, paid_on, paid_amount_halalas, reference, note, audit mixin`. A settlement, never an expense.

### 1.7 Company finance («مالية الشركة»)

**company_entries** — money not tied to a project: `id, org_id, type income/expense, category (COMPANY_*_CATS), date, payment_date (income: when it hit the bank → decides quarter), description, amount_halalas, note, tax_invoice + vat_amount_halalas + supplier_name/vat_no + invoice_no/date, audit mixin` (delete = archive, restorable).

**partners** — `id, org_id, name, share_pct real (e.g. 33.33), note, audit mixin`. Shares must total exactly 100% before any distribution is approved.

**distributions** — profit distribution, draft until completed (then frozen)
`id, org_id, period_type (q1..q4, annual, custom, project; "quarter" default), period_label, from_date, to_date, gross_income_halalas, gross_expenses_halalas, net_profit_halalas, distribution_pct (100), distributed_halalas, retained_halalas, retained_category ops/dev/reserve, project_ids JSON, project_id (single-project), status draft/completed, note, completed_at, paid_on, paid_by, audit mixin`.

**distribution_shares** — per partner: `id, distribution_id, partner_id, partner_name (copied), share_pct, amount_halalas, paid_on, paid_ref`.

**distribution_projects** — how much each project's realized profit a completed distribution paid out (prevents double distribution): `id, distribution_id, project_id, amount_halalas`.

### 1.8 Products, sales, quotes, site

**products** — «المنتجات والخدمات» offers
`id, org_id, slug (uq org), name, tagline, status draft/published/archived, show_on_site bool (only if published), content JSON (public-safe), pricing JSON (private: costs/margins, never public), sort_order, version, created/updated by/at`.

`content` shape: `hero{eyebrow,title,subtitle,tags[],imageAsset}`, `problems[] {title,text,icon}`, `offerings[] {title,icon,points[]}`, `model[]`, `benefits[]`, `comparison[] {label,self,us}`, `packages[] {id,name,audience,features[],highlight}` (≤6), `process[]` (workflow steps «آلية العمل» → project stages), `roles{client[],us[]}`, `standards[]`, `deliverables[]`, `proof[] {title,entity,beneficiaries,text,scope[]}`, `intake[] {key,label,type text/number/select/multi,options[],required}` (website form questions), `brochure bool (true)`, `comingSoon bool` (collects interest instead of requests), `faq[] {q,a}`. Icons whitelist: clock, globe, alert, settings, home, car, lock, users, check, chart, book, pulse, chat, badge, briefcase, code, megaphone, truck.

`pricing` shape: `method margin|markup|fixed`, `value %`, `lines[] {id,label,unit trip/night/person/month/project/fixed, cost, note}`, `packages[] {packageId, qty{lineId: n}, fixedPrice}`.

**product_requests** — opportunities / quote requests «الطلبات / الفرص»
`id, org_id, product_id, product_name (snapshot), source site|manual, status REQUEST_STATUSES ("new"), name (contact), entity (organisation), phone, email, message, answers JSON {label: answer}, quote JSON (priced snapshot incl. costs), notes, client_id, project_id (once converted), owner_id, follow_up_at, value_halalas (expected deal value), lost_reason, package_id, stage_changed_at, ip_hash (anti-abuse), created_at, updated_by, updated_at`.

**quotes** — «عرض سعر» (prices only)
`id, org_id, number QT-2026-0001 (uq), request_id, client_id, product_id, package_id, project_id (after convert), recipient, entity, title, items JSON [{label, qty, unitHalalas}], discount_halalas, vat_pct (15), valid_until, terms, status draft/sent/accepted/rejected, version, created_by, created_at, updated_at`.

**site_settings** (PK org_id) — public website: `draft JSON, published JSON ("" until first publish), published_at, published_by, version, updated_by, updated_at`.
**site_publishes** — history of publishes (last 20 kept): `id, org_id, content, published_at, published_by`.
Site content: `brand{name "بُعد التمكين", accent #5B3FE0|#0B1550|#F04E23, logoAsset, tagline}`, `contact{phone,whatsapp,email,socials{x,linkedin,instagram,youtube}}`, `seo{title,description}`, `show{trust,why,services,products,method,works,faq,testimonials}`, `hero`, `testimonials`, `trust`, `why`, `services`, `method`, `works`, `faq`, `cta{title,lead}`, `form`.

### 1.9 Plans & workspace

**plan_cycles** — `id, org_id, kind strategic|operational, name, start_date, end_date, vision, mission, values JSON string[], parent_cycle_id (operational → strategic), status draft/active/closed, version, created_by, created_at, updated_at`.
**plan_objectives** — `id, org_id, cycle_id (cascade), parent_id (strategic objective served), title, description, owner_id, quarter 0..4 (0 = whole cycle), weight 1..10, budget_halalas, sort, updated_at`.
**plan_indicators** (KPIs) — `id, org_id, objective_id (cascade), name, unit, baseline, target, current (manual), source "manual"|"platform:<metric>", direction up|down`.
**plan_initiatives** — `id, org_id, objective_id (cascade), title, owner_id, start_date, due_date, budget_halalas, status todo/doing/blocked/done, project_id, product_id`.
**plan_reviews** — quarterly review with frozen numbers: `id, org_id, objective_id, quarter, note, snapshot JSON, created_by, created_at`.

**meetings** — `id, org_id, title, starts_at "YYYY-MM-DDTHH:mm", duration_min (60), location, attendee_ids JSON, client_id, request_id, project_id, agenda, minutes, status scheduled/done/cancelled, activity_id (CRM log written once when held), created_by, created_at, updated_at`.
**decisions** — `id, org_id, title, details, owner_id, due_date, status open/done/cancelled, meeting_id, project_id, task_id (if converted), created_by, created_at, updated_at`.

### 1.10 Relationship map

```
orgs 1─* users, clients, projects, products, product_requests, quotes, documents, … (every table)
clients 1─* client_contacts, projects, crm_activities ; clients ← product_requests.client_id, quotes.client_id, meetings.client_id
projects 1─1 project_finance ; 1─* finance_entries, finance_budget_items, finance_categories,
         project_receipts, payment_schedule, sales_invoices, documents, project_stages, tasks,
         time_entries, project_members ; projects.product_id → products (soft)
documents 1─* document_versions, document_shares
payment_schedule.receipt_id → project_receipts ; sales_invoices.receipt_id → project_receipts
product_requests 1─* quotes (request_id), crm_activities (request_id), meetings (request_id)
quotes.project_id / product_requests.project_id → project created by conversion
distributions 1─* distribution_shares (→ partners), distribution_projects (→ projects)
plan_cycles 1─* plan_objectives 1─* plan_indicators, plan_initiatives, plan_reviews ; tasks.initiative_id → plan_initiatives
meetings 1─* decisions ; decisions.task_id → tasks
users 1─* notifications, project_members ; org_roles keyed by role_key
```

---

## 2. Enums & Arabic labels

### Clients / projects
| enum | values → Arabic |
|---|---|
| CLIENT_TYPES | company شركة · association جمعية · government جهة حكومية · individual فرد · other أخرى |
| PROJECT_TYPES | training تدريب · consulting استشارات · event فعالية · other أخرى |
| PROJECT_STATUSES | draft مسودة (gray) · active جاري التنفيذ (green) · completed مكتمل (blue) · paused متوقف (amber) · cancelled ملغي (red) |
| visibility | team (فريق) · private (خاص) |
| list sort | newest · name · value · contact (clients) · deadline (projects) |
| project flags | late (active & past end date) · due (pending instalment past due) |
| scopes | all كل المشاريع · team مشاريع الفريق · mine مشاريعي فقط |

### CRM / sales
| enum | values → Arabic |
|---|---|
| Activity types | call اتصال · meeting اجتماع · visit زيارة · email بريد · whatsapp واتساب · note ملاحظة · (stage: system) |
| Client sources | site الموقع · referral إحالة · event معرض أو فعالية · call اتصال وارد · social تواصل اجتماعي · other أخرى |
| Relationship (computed) | active عميل نشط · prospect محتمل · former عميل سابق · dormant خامل · new جديد |
| Follow-up state | overdue متأخرة · today اليوم · soon هذا الأسبوع (≤7 days) · later لاحقاً |
| REQUEST_STATUSES (stages) | new جديد «وصل الطلب ولم نتواصل بعد» · contacted مؤهَّل «تواصلنا وفهمنا الحاجة» · quoted عرض سعر «أرسلنا عرض سعر» · negotiating تفاوض «نناقش السعر والشروط» · won مكسوب «تم الاتفاق والتعاقد» · lost خاسر «لم تكتمل» |
| Stage probability | new 10% · contacted 20% · quoted 40% · negotiating 65% |
| Request source | site · manual |
| Quote status | draft مسودة · sent أُرسل · accepted مقبول · rejected مرفوض |
| Schedule kinds (quote convert) | full «دفعة واحدة بعد 30 يوماً» · half «50% عند البدء و50% بعد 60 يوماً» (default) · thirds «40% عند البدء و30% بعد 30 يوماً و30% بعد 60 يوماً» · none «بلا جدول دفعات» |
| Product status | draft مسودة · published منشور · archived مؤرشف |
| Cost units | trip رحلة · night ليلة · person · month · project · fixed |
| Pricing method | margin (price = cost/(1−m)) · markup (cost×(1+m)) · fixed |

### Finance
| enum | values → Arabic |
|---|---|
| ENTRY_TYPES | income (إيراد) · expense (مصروف) |
| ENTRY_STATUSES | "" — · paid مدفوع · pending معلق · cancelled ملغي |
| Built-in categories | salary رواتب · logistics لوجستيات · materials مواد · other أخرى · exec أتعاب · mkt تسويق · cashback كاش باك · cf رسوم إضافية · vat ضريبة |
| Default op cats | salary, logistics, materials, other |
| FEE rows (UI) | exec أتعاب التنفيذ · mkt التسويق · cb كاش باك · cf رسوم إضافية |
| FEE_TYPES / FEE_BASES | pct / fixed ; net / gross |
| CATEGORY_TYPES | expense · income · both |
| cf_kind | "" (undecided) · vat (contract VAT held for ZATCA) · fee |
| Agreement items | exec «أتعاب التنفيذ» (income) · cf «ضريبة القيمة المضافة» · mkt «تسويق» · cashback «كاش باك» (expenses) |
| Schedule status | pending · received · cancelled |
| Aging buckets | current غير مستحقة · d1_30 1–30 يوماً · d31_60 31–60 يوماً · d61_90 61–90 يوماً · d90 أكثر من 90 يوماً |
| Company income cats | project_fee أتعاب مشروع · subscription رسوم اشتراك · setup رسوم إعداد وتشغيل · consulting خدمات استشارية · commission عمولات · other أخرى |
| Company expense cats | hosting استضافة وبنية تحتية · marketing تسويق وإعلان · payroll رواتب وأجور · tools خدمات وأدوات · legal قانونية وإدارية · other أخرى · asset أصل رأسمالي (أجهزة، أثاث…) · purchase مشتريات عامة · zakat زكاة · gov_fees رسوم حكومية |
| RETAINED_CATS | ops تشغيل · dev تطوير · reserve احتياطي |
| DISTRIBUTION_STATUSES | draft · completed (موزّع/معتمد) |
| Distribution modes | period · project · quarter · manual ; periodType q1..q4, annual, custom, project |
| Quarter stamp | distributed موزّع · partial موزّع جزئياً · open لم يُوزَّع |
| VAT filing status | open مفتوح (gray) · filed قُدِّم (amber) · paid سُدِّد (green) |
| VAT period | quarterly · monthly |

### Documents
| enum | values → Arabic |
|---|---|
| DOC_KINDS | contract عقد · letter خطاب |
| DOC_STATUSES | draft مسودة · review قيد المراجعة · approved معتمد |
| Built-in contract templates | service «عقد تقديم خدمات وتنفيذ مشاريع» · nda «اتفاقية عدم إفصاح وسرية المعلومات» · employment «عقد عمل» · consulting «عقد تقديم خدمات استشارية» · blank «عقد (نموذج فارغ)» |
| Letter templates | cashback (خطاب كاش باك) · custom «خطاب مخصص» |
| Share channel | whatsapp · email · link ; days 7 or 30 |
| Footer labels | سري · مسودة · نسخة طبق الأصل · نهائي |

### Tasks / plans / workspace
| enum | values → Arabic |
|---|---|
| Task status | todo لم تبدأ · doing قيد التنفيذ · blocked معلّقة · done منجزة |
| Task priority | low منخفضة · normal عادية · high عالية |
| Stage status | todo · doing · done (same labels) |
| Initiative status | todo لم تبدأ · doing قيد التنفيذ · blocked متعثرة · done منجزة (weights 0 / 0.5 / 0.25 / 1) |
| Cycle kind | strategic الخطة الاستراتيجية · operational الخطة التشغيلية |
| Cycle status | draft مسودة · active جارية · closed مغلقة |
| Plan status (computed) | no_data بلا قياس · not_started لم يبدأ · on_track على المسار · at_risk معرّض للتأخر · late متأخر · done مكتمل |
| Meeting status | scheduled مجدول · done عُقد · cancelled أُلغي |
| Decision status | open مفتوح · done نُفّذ · cancelled أُلغي |
| Platform metrics (KPI sources) | contracts قيمة العقود الجديدة (ر.س) · projects_started مشاريع بدأت · projects_completed مشاريع مكتملة · clients_new عملاء جدد · requests طلبات العروض الواردة · requests_won طلبات تحوّلت إلى عقد · conversion نسبة تحويل الطلبات (%) · revenue الإيرادات المحصّلة (ر.س) · products_published المنتجات المنشورة في الموقع · associations_active جمعيات لها مشروع نشط. Money metrics (revenue, contracts) hidden without finance perms. |

### Audit entity labels (activity page filter)
client العملاء · project (المشاريع) · document المستندات · company مالية الشركة · vat الضريبة · product المنتجات · request الطلبات · site الموقع · org المنشأة · user المستخدمون · role الأدوار · asset الملفات · import الاستيراد · task المهام · quote عروض الأسعار · plan الخطط · meeting الاجتماعات · decision القرارات · export. Verbs: إضافة/تعديل/حذف, archive أرشفة, restore استعادة, status تغيير حالة, outgoing تسجيل صادر, duplicate نسخ, publish نشر, approve اعتماد, close إغلاق, reopen إعادة فتح.

### Numbering (`NUMBERING`, prefix editable in settings; format `formatCode`)
| kind | label | default prefix | yearly | example |
|---|---|---|---|---|
| project | المشاريع | PRJ | yes | PRJ-2026-0001 |
| client | العملاء | CL | no | CL-0001 |
| quote | عروض الأسعار | QT | yes | QT-2026-0001 |
| doc_contract | العقود | CT | yes | CT-2026-0001 |
| doc_letter | الخطابات | LT | yes | LT-2026-0001 |
| outgoing | الصادر | ص | yes | ص-2026-0001 |
Seq zero-padded to 4 (grows beyond: CL-12345). Prefix regex `^[\p{L}\p{N}]{1,8}$`. Year = current UTC year. Counter may only move forward (`counter_down` 409).

---

## 3. Permissions & roles (`packages/domain/src/permissions.ts`)

### 3.1 Permission keys (`module.action`), in UI order
Action labels: view عرض · edit تعديل · archive أرشفة · delete حذف · share مشاركة · profit إظهار الأرباح · manage إدارة · run تنفيذ.

| module | label / hint | actions |
|---|---|---|
| clients | العملاء — ملفات العملاء وجهات الاتصال | view, edit, archive, delete |
| projects | المشاريع — المشاريع وبياناتها | view, edit, archive, delete |
| documents | المستندات — العقود والعروض والخطابات | view, edit, share |
| finance | مالية المشروع — مصروفات وإيرادات ودفعات كل مشروع | view, edit, profit |
| treasury | المالية العامة — الشركة والشركاء والتوزيعات والتقارير | view, edit |
| vat | ضريبة القيمة المضافة — إقرار الضريبة الربع سنوي | view, edit |
| products | المنتجات والخدمات — العروض والتسعير الداخلي | view, edit |
| sales | المبيعات — طلبات العملاء والمتابعة | view, edit |
| site | الموقع — محتوى الموقع العام والنشر | view, edit |
| assets | الملفات والشعارات — رفع الشعارات والصور | edit |
| org | بيانات المنشأة — الاسم والترقيم والإعدادات | edit |
| import | الاستيراد — استيراد بيانات النسخة القديمة | run |
| plans | الخطط — الخطة الاستراتيجية والتشغيلية | view, edit |
| tasks | المهام والتنفيذ — مهام الفريق ومراحل المشاريع | view, edit |
| meetings | الاجتماعات والقرارات — المواعيد والمحاضر والقرارات ومتابعتها | view, edit |
| team | الفريق — المستخدمون والدعوات | view, manage |
| roles | الأدوار والصلاحيات — تعديل جدول الصلاحيات | manage |
| audit | سجل النشاط — من فعل ماذا ومتى | view |

Total 38 keys. `normalizePerms`: any non-view action implies `<module>.view` (except `run`). Sensitive: `finance.profit`.

### 3.2 Built-in roles (BASE = clients.view, projects.view, documents.view)
| key | name | description | grants | projects scope |
|---|---|---|---|---|
| owner | المالك | كل شيء، ولا يمكن تقييده. | ALL (cannot be overridden) | all |
| general-manager | المدير العام | إدارة العمل كاملة عدا الحذف النهائي والاستيراد وتعديل الأدوار. | ALL except projects.delete, clients.delete, import.run, roles.manage | all |
| finance-manager | المدير المالي | المالية والضريبة والشركاء مع اطلاع على المشاريع والعملاء. | BASE + clients.edit, documents.edit, documents.share, finance.* (view/edit/profit), treasury.*, vat.*, audit.view, team.view, plans.view, tasks.view, meetings.view | all |
| project-manager | مدير مشاريع | يدير العملاء والمشاريع ومالية المشروع دون أرباح الشركة. | BASE + clients.edit, clients.archive, projects.edit, projects.archive, documents.edit, documents.share, finance.view, finance.edit, finance.profit, products.view, sales.view, team.view, plans.view, tasks.view, tasks.edit, meetings.* | all |
| sales | مبيعات وعلاقات عملاء | العملاء والطلبات والعروض، بلا أرقام الأرباح. | BASE + clients.edit, projects.edit, documents.edit, documents.share, finance.view, products.view, sales.*, site.view, tasks.view, meetings.* | all |
| accountant | محاسب | إدخال المصروفات والمقبوضات والضريبة دون تعديل العقود. | BASE + finance.view, finance.edit, finance.profit, treasury.*, vat.* | all |
| team-member | عضو فريق | يعمل على مشاريع الفريق ويرى ماليتها دون الأرباح. | BASE + clients.edit, projects.edit, finance.view, tasks.view, tasks.edit, meetings.* | team |
| viewer | مشاهد | قراءة فقط. | BASE + tasks.view, meetings.view | team |

- Legacy mapping (users.role → role key when role_key = ""): owner→owner, admin→general-manager, member→team-member; unknown → viewer.
- Org may edit any built-in role except owner (PUT stores override in org_roles) or create custom roles (key `^[a-z][a-z0-9-]{1,39}$`). DELETE on a built-in = reset to default; on a custom one refused if assigned (`role_in_use`). A role that no longer exists grants nothing.
- Only an owner may assign/change/deactivate an owner (`canAssignRole`); the last active owner cannot be demoted/deactivated (`last_owner`).

### 3.3 Project visibility (`visibleProjects`, scope = role.scopes.projects, default "team")
- **all**: every project.
- **team** (v1 rule): owner_id = me OR visibility = 'team' OR owner_id = '' OR I am in project_members.
- **mine**: owner_id = me OR I am in project_members.
- Invisible project = 404 on every project, finance, document, receivable, task route. Documents follow project visibility. Changing a project's visibility requires being its owner or scope = all.
- Tasks list: company tasks (project_id "") + tasks on visible projects + tasks assigned to me.
- Meetings: scope "all" sees/manages all; others see meetings they organise/attend or about a visible project. Decisions: owner, author, those who see its meeting/project; unlinked = company-wide.
- Money fields hidden without `finance.view` (lists return `received: null`, `owed: null`, etc.). Profit hidden without `finance.profit`: project finance GET zeroes execV, mktV, entries[].profitMargin, summary.profit/profitMargins/execAmt/execIncomeReg/nonExecInc/mkt and sets `profitHidden: true`; request quote snapshot strips cost/profit/marginPct/unitCost.

### 3.4 Middleware
- `requireAuth` — session cookie or Bearer token → 401 `unauthorized`.
- `requirePerm(...keys)` — all listed perms → else 403 `forbidden`.
- `requireRW(view, edit)` — GET/HEAD need `view`, other methods need `edit`.

---

## 4. Auth flow

| Item | Detail |
|---|---|
| Session | JWT HS256 signed with `JWT_SECRET` (≥16 chars). Claims `{sub: userId, org, role, v: tokenVersion, kind: "session", exp}`. TTL **12 h**. |
| Cookie | `buad_session`; httpOnly, Secure, SameSite=Strict, path `/`, maxAge 12h. |
| Bearer | `Authorization: Bearer <jwt>` accepted as alternative (cookie wins). |
| Revocation | Every request re-reads the user; inactive or `tokenVersion ≠ v` → 401. Version bumps on password set/change, recovery, logout-others, deactivation. |
| Passwords | PBKDF2-SHA256, 100k iterations, 16-byte salt. Min length 8 (owner setup 12). Unknown emails cost the same time (dummy hash). |
| Legacy v1 users | `legacy_hash` (djb2) verified once on login then replaced with PBKDF2. |
| Login rate limit | `LOGIN_LIMITER` per `cf-connecting-ip` → 429 `too_many_attempts` (login and recover). |
| First-owner setup | Only when env `OWNER_SETUP_TOKEN` (≥24 chars) is set. `GET /api/setup/status` → `{needsSetup}`; `POST /api/setup/owner {token, name, email, password≥12}` creates org `org_platform` ("بُعد") + owner atomically (an existing same-email user is promoted). Errors: 404 not_found (disabled), 403 invalid_token, 409 already_set_up. Sets cookie. |
| Invite | Admin `POST /api/team/users {email,name,roleKey}` creates user with `must_change_pass=true`, returns `setupToken` (JWT kind "setup", TTL **7 days**). Link shown to admin: `/login?token=<setupToken>`. Pending users cannot log in by password. Re-issue: `POST /api/team/users/:id/reset` or `POST /api/users/:id/invite`. |
| Set password | `POST /api/auth/setup-password {setupToken, password≥8}` → verifies kind=setup & version, sets password (bumps version, clears must_change_pass), signs in. |
| Change password | `POST /api/auth/change-password {current, password}` → 403 `wrong_password`; re-issues cookie. |
| Recovery key «مفتاح الاستعادة» | `POST /api/auth/recovery-key` → 20 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, shown once as `XXXXX-XXXXX-XXXXX-XXXXX`; only hash stored; new one replaces old. `GET` → `{exists, createdAt}`. |
| Forgot password | `POST /api/auth/recover {email, key (case/dash-insensitive, 20 chars), password}` → sets password, signs out all devices, consumes key, signs in. 401 `invalid_recovery`. No email involved. |
| Logout | `POST /api/auth/logout` deletes cookie. `POST /api/auth/logout-others` bumps version and re-issues own cookie. |
| publicUser | `{id, orgId, email, name, role, roleKey, perms[], scopes{projects}}` — the web uses `perms` to show/hide UI (`useCan`). |

---

## 5. API routes

Notation: `[perm]` = required permission; `RW(a,b)` = GET needs a, writes need b. All under `/api`, all require auth unless marked PUBLIC. Bodies in riyals unless noted.

### 5.1 Core (app.ts)
- GET `/health` PUBLIC → `{ok, service:"buad-v2-api", version}`
- GET `/setup/status` PUBLIC → `{needsSetup}`
- POST `/setup/owner` PUBLIC `{token,name,email,password}` → `{user}`
- POST `/auth/login` PUBLIC `{email,password}` → `{user}` + cookie; 401 invalid_credentials
- POST `/auth/setup-password` PUBLIC `{setupToken,password}` → `{user}`
- POST `/auth/logout` PUBLIC → `{}`
- POST `/auth/change-password` `{current,password}` → `{}`
- GET `/auth/recovery-key` → `{exists, createdAt}` ; POST → `{key}`
- POST `/auth/recover` PUBLIC `{email,key,password}` → `{user}`
- POST `/auth/logout-others` → `{}`
- POST `/exports` `{what, format: xlsx|csv|pdf|print|json}` → `{}` (audit line «تصدير …»)
- POST `/users/:id/invite` [team.manage] → `{setupToken}`
- GET `/me` → `{user}`
- GET `/users` [team.view] → `{users:[{id,email,name,role}]}`
- GET `/site`, `/site/*` (non-API) → SPA shell with link-preview meta from published site.

### 5.2 Clients — `/api/clients` RW(clients.view, clients.edit)
- GET `/` ?q,type,sort(newest|name|value|contact),archived(0|1),owner(me|id),rel,source,tag,followup=due → `{items:[{id,code,name,type,city,email,phone,logoUrl,createdAt,archivedAt,projectCount,projectValue(halalas),recentProjects[{id,name}]≤3,documentsCount,lastActivity,ownerId,ownerName,source,tags[],nextFollowUpAt,lastContactAt,activeProjects,completedProjects,openRequests,openQuotes,owed(halalas|null),lateInstalments,relationship}], counts{type:n}}` (≤1000)
- GET `/check-duplicate` ?name,regNo,taxNo,selfId → `{duplicate:{id,code,name,regNo,taxNo,archivedAt,field}|null, similar:{id,code,name}|null}`
- POST `/` clientInput `{name*, type, email, phone, city, regNo, taxNo, address, website, notes, logo(dataURL), signatoryName, signatoryTitle, contacts[{name,title,phone,email}]≤20, confirmSimilarName}` → 201 `{id, code}`; 409 `duplicate`(+duplicate) / `similar_name`(+similar)
- GET `/:id/logo` → image bytes (cached immutable)
- GET `/:id` → `{client, contacts[], projects[{id,number,name,type,status,startDate,endDate,expectedValue,contractTotal,archivedAt,external}]}`
- GET `/:id/statement` → statement of account `{client{…}, org{name,reg,tax,bankName,bankIban,urls}, items[{id,number,name,status,startDate,endDate,hasFinance,contractNo,contractNet,vat,gross,spent,income,remaining,received,owed}], totals{same keys}, generatedAt}` (riyals; in-finance projects only)
- PATCH `/:id` clientPatch (partial + confirmSimilarName) → `{}`; contacts replaced wholesale when sent
- POST `/:id/archive` [clients.archive] → archives client + its live projects (same timestamp, `archived_with`)
- POST `/:id/restore` [clients.archive] → restores client + exactly those projects
- DELETE `/:id` [clients.delete] → only if client never had projects (409 `has_projects`)

### 5.3 CRM — `/api/crm`
- GET `/clients/:id` [clients.view] → `{relationship, crm{ownerId,ownerName,source,tags,nextFollowUpAt,lastContactAt}, activities[]}`
- POST `/clients/:id/activities` [clients.edit] `{type, summary*, on?(date; today=now), requestId, followUpAt?(""=clear)}` → 201 `{id}` (updates lastContactAt only if newest)
- DELETE `/activities/:id` [clients.edit] → `{}` (lastContactAt falls back)
- PATCH `/clients/:id` [clients.edit] `{ownerId?, source?, tags?[], nextFollowUpAt?}` → `{}`
- GET `/followups` [clients.view] ?scope=mine|all → `{today, items[{kind:"client"|"request", id, title, subtitle, phone, date, ownerId, ownerName, …}]}` (requests only with sales.view)

### 5.4 Projects — `/api/projects` RW(projects.view, projects.edit)
- GET `/` ?q,type,status,clientId,product(id|none),sort(newest|name|value|deadline),flag(late|due),archived,external(0|1) → `{items:[{id,number,name,type,status,visibility,location,startDate,endDate,expectedValue,contractTotal(halalas incl VAT),estimated(bool: no finance row → expected+15%),archivedAt,closedAt,external,clientId,clientName,clientLogoUrl,clientCode,productId,packageId,packageName,productName,received(halalas|null),stagesTotal,stagesDone,tasksOpen,tasksDone,tasksOverdue,nextDueDate,nextDueAmount(halalas|null),late,fullyDistributed}], counts{status:n}}`
- POST `/` projectInput `{clientId*, name*, type, status, visibility, location, startDate, endDate, payDate, expectedValue, notes, productId, packageId, external}` → 201 `{id, number}`; errors client_not_found 404, client_archived 409, product_not_found/package_not_found 404, package_without_product 400, end_before_start
- GET `/:id` → `{project, service{productId,productName,packageId,packageName}|null, client{id,code,name,type,archivedAt,logoUrl}, financeExists, financeImported}`
- PATCH `/:id` projectPatch (partial) → `{}`; 403 visibility change by non-owner; 409 `has_finance_records`(+held[entries|receipts|invoices|instalments]) when turning external
- POST `/:id/archive` [projects.archive] ; POST `/:id/restore` [projects.archive] (409 client_archived)
- DELETE `/:id` [projects.delete] → 409 `has_records` if any FK rows (archive instead)

### 5.5 Project finance — `/api/projects/:projectId/finance` RW(finance.view, finance.edit)
Writes on a closed project → 409 `project_closed`; on external → 409 `project_external`. Every write returns the full finance view.
Finance view: `{ctrl{contractNo,contractDate,contractValue(halalas),cvLocked,vatIncluded,vatPct,execV,execType,execBase,mktV,mktType,mktBase,mktInternal,cbV,cbType,cbBase,cfV,cfType,cfBase,opCats[],version(0=no row),updatedAt}, entries[] (raw rows, halalas), budget[], categories[], receipts[], received (riyals, approved only), summary (finCalc, riyals — see §6.4), profitHidden}`
- GET `/` → finance view
- PATCH `/ctrl` `{version*, …ctrl fields partial}` → view; 409 `stale`(+version), `cv_locked`
- POST `/entries/bulk-status` `{status: paid|pending}` → marks all status="" entries
- POST `/entries` `{date, description*, cat, type*, amount*>0, profitMargin, profitMarginType, status, note, cfKind, taxInvoice?{vatAmount?, supplierName, supplierVatNo, invoiceNo, invoiceDate}|null}` → 201 `{id,…view}`; 400 invalid_category, tax_invoice_on_expense_only
- PATCH `/entries/:entryId` partial (taxInvoice absent=keep, null=remove) ; DELETE `/entries/:entryId`
- POST `/agreement/:item` (exec|cf|mkt|cashback|bdg_<id>) → 201 view; 409 already_registered, 400 zero_amount
- POST `/agreement-all` → `{registered[],…view}`
- POST `/receipts` `{date*, amount*(≠0, negative=refund), note, basis, confirmOver?}` → 201 view (auto-approved by saver); 409 `over_contract`(+gross, received) unless confirmOver
- PATCH `/receipts/:receiptId` same body ; POST `/receipts/:receiptId/approve` (only unapproved)
- DELETE `/receipts/:receiptId` → 409 `in_distribution` if a completed distribution covered that date; reopens any schedule line it closed
- POST `/budget` `{name, amount, note}` ; PATCH `/budget/:itemId` ; DELETE `/budget/:itemId`
- POST `/categories` `{label*, type}` → 201 `{id}` ; DELETE `/categories/:catId` (409 `in_use`+count)

### 5.6 Project close — `/api/projects/:projectId/close` [finance.edit]
- GET `/` → closeCheck `{closed{at,by,note}|null, figures{gross,received,remaining,expenses,profit,realized,distributed,undistributed,unclassified}, vat{outputVat,inputVat,net,reserved,invoices,source:"invoices"|"receipts"}, warnings[{code,text,count?}]}`
- POST `/` `{note}` → sets status=completed, closedAt/By/Note; 409 already_closed, project_external
- POST `/reopen` `{reason* (3..500)}` → clears close fields; 409 not_closed

### 5.7 Receivables — `/api/receivables`
- GET `/` [treasury.view] ?opening(riyals) → `{today, aging{total,overdue,buckets{current,d1_30,d31_60,d61_90,d90:{amount,count}}}, items[{id,projectId,label,dueDate,amount,status,receivedAt,project,client,phone}], weeks[13 × {start,end,inflow,outflow,net,balance}], shortfallWeek|null, pendingExpenses}` (riyals; pending lines of in-finance projects; outflows = pending expense entries)
- GET `/projects/:projectId` [finance.view] → `{items[schedule lines]}`
- POST `/projects/:projectId` [finance.edit] `{label*, dueDate*, amount*>0 (gross)}` → 201 `{id}`; 409 project_external
- PATCH `/:id` [finance.edit] `{label?, dueDate?, amount?, status?: pending|cancelled}` → 409 already_received
- DELETE `/:id` [finance.edit] → 409 already_received
- POST `/:id/receive` [finance.edit] `{date?, amount?}` → `{receiptId, rest}`; creates approved receipt (basis «من جدول الدفعات»); partial → line closes at paid amount, new pending line «<label> (المتبقي)» for the rest; 409 not_pending, project_closed; 400 amount_exceeds_line

### 5.8 Documents
`/api/projects/:projectId/documents` [documents.view]:
- GET `/` → `{items[{id,kind,number,title,status,outgoingNo,…}]}`
- POST `/` [documents.edit] `{kind, template (built-in key or custom template id), title?}` → 201 `{id, number}`; contract number copied into `contract_no` variable unless finance has one; 400 unknown_template

`/api/documents` [documents.view]:
- GET `/templates` → `{contracts[{key,title,clauses}], letters[{key,title}]}`
- GET `/` ?q,kind,status,outgoing(1),clientId,projectId → register `{items[…], counts, outgoingCount}`
- GET `/:id` → view `{document, project{id,number,name}, values (resolved variables), auto (auto-fill values), org{name,urls}, versions[{version,approvedBy,approvedAt}]}`
- PATCH `/:id` [documents.edit] `{version*, title?, number?, variables?{}, content?[clauses], layout?}` → view; 409 approved_locked, stale, number_taken
- POST `/:id/status` [documents.edit] `{to: draft|review|approved, version}` → view; approval snapshots into document_versions; →review notifies all documents.edit users (kind approval «طلب اعتماد: …»)
- POST `/:id/outgoing` [documents.edit] → `{outgoingNo, created, projectNumber?}`; 409 not_approved
- GET `/:id/versions/:version` → snapshot
- POST `/:id/duplicate` [documents.edit] → 201 `{id, number}` (new number, draft, no outgoing)
- DELETE `/:id` [documents.edit] → only never-approved drafts (409 `has_history`)

`/api/documents/:docId/shares` [documents.share]:
- GET `/` → `{items[shares]}` ; POST `/` `{days: 7|30, channel}` → 201 `{path: "/s/<token>", expiresAt}` (409 not_approved) ; DELETE `/:shareId` → revoke

`/api/public/s` PUBLIC: GET `/:token` → last approved version (counts a view) ; POST `/:token/pdf` → PDF ; GET `/:token/assets/:assetId` → only images used by that doc/letterhead.

### 5.9 Sales — opportunities `/api/product-requests` RW(sales.view, sales.edit)
- GET `/` ?status → `{requests[shapeRequest + interest(bool: product comingSoon)], counts{status:n}}` (≤300)
  - shapeRequest: `{id, productId, productName, source, status, name, entity, phone, email, message, answers{}, quote{}, notes, clientId, projectId, ownerId, followUpAt, value (riyals), lostReason, packageId, stageChangedAt, updatedAt, createdAt}`
- GET `/:id` → `{opportunity{…+productName, packageName, ownerName}, client{id,code,name,phone,email,archived}|null, quotes[shapeQuote], activities[]}`
- POST `/` `{clientId | newClient+entity/name, confirmSimilarName, name, entity, phone, email, message, answers, productId|productSlug, packageId, value, ownerId, followUpAt}` → 201 `{id, clientId}`; errors client_not_found, client_archived, name_required, contact_required (phone or email needed unless newClient/clientId), owner_not_found, product_not_found, similar_name. Notifies a new owner («أُسندت إليك فرصة: …»).
- POST `/:id/activities` `{type, summary, on?, followUpAt?}` → 201 `{id, clientId}`; auto-creates/links client; new → contacted
- PATCH `/:id` `{status?, notes?, ownerId?, followUpAt?, value?, lostReason?, productId?, packageId?}` → `{}`; status change logs a `stage` activity
- PUT `/:id/quote` `{productId, packageId, times}` → `{quote}` priced server-side from product pricing; 400 quote_incomplete(+reason,missing); moves new/contacted → quoted; sets value if empty
- POST `/:id/convert` `{clientId?, confirmSimilarName, projectName?}` → 201 `{clientId, projectId, number}`; draft project at quoted price; request → won; 409 already_converted

### 5.10 Quotes — `/api/quotes` RW(sales.view, sales.edit)
shapeQuote: `{id, number, requestId, clientId, productId, packageId, projectId, recipient, entity, title, items[{label,qty,unit,total}], discount, vatPct, validUntil, expired, terms, status, version, totals{subtotal,discount,net,vat,total}, totalHalalas, createdAt, updatedAt}`
- GET `/` ?status → `{quotes[]}` (≤200)
- POST `/` `{requestId, clientId, productId, packageId, recipient, entity, title*, items[{label,qty,unit}]≤40, discount, vatPct(15), validUntil, terms}` → 201 `{id, number}` (fills recipient/entity/client from request)
- GET `/catalog` → `{items[{productId,productName,packageId,packageName,price}]}` (published products, selling price only)
- GET `/vat-rate` → `{rate}`
- GET `/:id` → `{quote, org (profile)}`
- PATCH `/:id` `{version*, …partial}` → `{version}`; 409 version_conflict, accepted_locked
- POST `/:id/status` `{to}` → `{}`; transitions draft→sent; sent→draft|accepted|rejected; rejected→draft|sent; accepted final. 409 bad_transition, no_items (send without items), expired (accept past validUntil)
- POST `/:id/duplicate` → 201 `{id, number}` (new draft, validUntil cleared)
- POST `/:id/convert` `{schedule: full|half|thirds|none, clientId?, confirmSimilarName, projectName?}` → 201 `{clientId, projectId, number, instalments}`; 409 not_accepted, already_converted
- DELETE `/:id` → drafts only (409 only_drafts)

### 5.11 Sales dashboard — `/api/sales` [sales.view]
- GET `/overview` ?from&to → `{pipeline{stages[{stage,count,value,weighted}], open{count,value,weighted}}, results{won,lost,winRate,avgCycleDays,wonThisQuarter}, followups{leadsDue,clientsDue}, stale[], quotes{sent,accepted,rejected,acceptRate,acceptedValue,avgValue,expiring[],waiting[]}, period{from,to,leads}, sources[{source,total,won,rate}], monthlyWon[12×{month,value}], topClients[{id,name,value}]}`

### 5.12 Products — `/api/products` RW(products.view, products.edit)
- GET `/` → list of products (summary + readiness)
- GET `/blueprints` → ready-made service blueprints and whether each exists
- GET `/overview` → per-service stats across projects (counts, entities, packages, money)
- GET `/unlinked-projects` → live projects without a service
- POST `/reorder` `{ids[]}` → sets sort_order
- POST `/from-blueprint/:key` → `{id, created}` (idempotent; 201 when created)
- POST `/seed-blueprints` → `{created[], existing}` (all as drafts)
- POST `/` `{name*, slug?, tagline?}` → 201 `{id}`
- GET `/:id/stats` → service stats (projects using it)
- GET `/:id` → `{product{id,slug,name,tagline,status,showOnSite,version,updatedAt,content,pricing,vatRate,readiness[{key,label,ok,hint}]}}`
- PATCH `/:id` `{version*, name?, slug?, tagline?, status?, showOnSite?, content?, pricing?}` → `{version}`; 409 stale, duplicate_slug; 400 invalid_asset (cover image must be own asset)

### 5.13 Website — `/api/site` RW(site.view, site.edit)
- GET `/draft` → draft content + version + dirty flag ; GET `/preview` → home as draft would render
- PATCH `/draft` `{version, content}` → `{version}`; 400 invalid_asset; 409 stale
- POST `/publish` → `{publishedAt}` (snapshot; keeps last 20)
- GET `/history` → publishes (live flagged) ; POST `/history/:id/restore` → puts it back as DRAFT
- GET `/overview` → requests, listed products, changes since publish ; POST `/unpublish`

`/api/public/site` PUBLIC:
- GET `/` → published site `{published:false}` or content + listed products
- GET `/products/:slug` → public product (content only)
- POST `/products/:slug/brochure` → service profile PDF (cached in R2)
- GET `/assets/:id` → only images the published site uses
- POST `/requests` `{productSlug?, name*(2..100), entity, phone, email, message, answers{key:answer}, website(honeypot)}` → 201 `{}`; phone or email required; required intake answers (400 missing_answers+keys); same-origin only (403 bad_origin); 5/IP/hour (429 rate_limited), 200/day (429 busy); honeypot filled → fake ok

### 5.14 Tasks — `/api/tasks` RW(tasks.view, tasks.edit)
- GET `/assignees` → `{users[{id,name}]}`
- GET `/` ?mine=1, project, status, assignee, overdue=1 → `{items[task + projectName, assigneeName]}` (≤300; open first, by due date)
- POST `/` `{title*, description, projectId, stageId, initiativeId, assigneeId, status, priority, startDate, dueDate}` → 201 `{id}`; notifies assignee; errors project_not_found, assignee_not_found, end_before_start
- PATCH `/:id` partial → `{}` (status done sets done_at) ; DELETE `/:id`
- POST `/:id/time` `{minutes 1..1440, date, note}` → 201 `{id}`
- GET `/projects/:projectId` → `{stages[], tasks[], minutes, hasService…}` (project execution tab)
- POST `/projects/:projectId/stages` `{title*, status, dueDate}` → 201 `{id}`
- POST `/projects/:projectId/stages/from-service` → copies service `process` steps once → 201 `{count}`; 409 no_service, has_stages, no_steps
- PATCH `/stages/:id` ; DELETE `/stages/:id`

### 5.15 Meetings & decisions — RW(meetings.view, meetings.edit)
`/api/meetings`:
- GET `/` ?from,to,mine=1,status,clientId,requestId,projectId → list with link names, attendees
- GET `/:id` → meeting + decisions
- POST `/` `{title*, startsAt*, durationMin(5..1440, 60), location, attendeeIds[]≤40, clientId, requestId, projectId, agenda, minutes, status}` → 201 `{id}`; notifies attendees («دعوة لاجتماع: …»)
- PATCH `/:id` partial → attendees may edit minutes/status only, rest organiser (403 organiser_only); held (done) with client/request → logs CRM «اجتماع» once
- DELETE `/:id` (organiser) — decisions stay, unlinked

`/api/decisions`:
- GET `/` ?status, mine=1, meeting ; POST `/` `{title*, details, ownerId, dueDate, status, meetingId, projectId}` → 201 `{id}` (notifies owner)
- PATCH `/:id` (author/owner rules; 403 author_only) ; DELETE `/:id`
- POST `/:id/task` → converts to task (needs tasks.edit) → 201 `{taskId}`; 409 already_converted

### 5.16 Plans — `/api/plans` RW(plans.view, plans.edit)
- GET `/metrics` → `{metrics{key: value}}` (platform KPI values)
- GET `/templates` ; POST `/from-template/:key` `{year 2024..2035}` → 201 `{strategicId, operationalId}` (409 exists)
- GET `/indicators/:id/series` → cumulative monthly curve + pace (400 not_cumulative; 403 money metric)
- GET `/cycles` → list ; POST `/cycles` `{kind, name*, startDate, endDate, parentCycleId}` → 201 `{id}`
- GET `/cycles/:id` → `{cycle{…,values[]}, objectives[{…, budget, indicators[{…, current|null, attainment}], initiatives[{…, budget}], reviews[], progress, status}], progress, status, budget}`
- PATCH `/cycles/:id` `{version*, name?, startDate?, endDate?, vision?, mission?, values?[], status?, parentCycleId?}` → `{version}` ; DELETE `/cycles/:id` (409 has_children)
- POST `/objectives` `{cycleId, parentId, title*, description, ownerId, quarter 0..4, weight 1..10, budget}` ; PATCH/DELETE `/objectives/:id`
- POST `/objectives/:id/indicators` `{name*, unit, baseline, target*, current, source manual|platform:<metric>, direction}` ; PATCH/DELETE `/indicators/:id`
- POST `/objectives/:id/initiatives` `{title*, ownerId, startDate, dueDate, budget, status, projectId, productId}` ; PATCH/DELETE `/initiatives/:id`
- POST `/objectives/:id/reviews` `{quarter, note}` → frozen snapshot
- GET `/owners` → `{owners[{id,name}]}`

### 5.17 Company finance — `/api/finance/company` RW(treasury.view, treasury.edit)
- GET `/overview` ?from,to → company income/expenses by month, projects profit, totals
- GET `/quarter` ?year&q(0..4; 0 = year) → realized profit per project (quarterView rows: receivedInPeriod, receivedToDate, realizedInPeriod, realizedToDate, distributed, available, flags[no_receipts, over_distributed, estimate, pending_expenses, cancelled, inactive]), company income/expenses, stamp distributed/partial/open, default selection
- GET `/receipt-suggestions` → proposed receipts (from v1 data) to verify & approve
- GET `/entries` ?archived → company entries ; POST `/entries` companyEntryInput `{type, category (must match type's list), date, paymentDate, description*, amount*>0, note, taxInvoice?}` ; PATCH `/entries/:id` (same body) ; DELETE `/entries/:id` (= archive) ; POST `/entries/:id/restore`
- GET `/balances` → `{projects, companyIncome, companyExpenses, settled[], retainedBy{ops,dev,reserve}, approvedUnpaid, …}` (realized − settled = undistributed)
- GET `/partners` → `{items, totalPct}` ; POST `/partners` `{name*, sharePct 0<..100, note}` (409 shares_over_100+total) ; PATCH `/partners/:id` ; DELETE `/partners/:id` (archive; past distributions keep copies)
- GET `/distributions` → `{items}` ; POST `/distributions/preview` distributionInput → computed amounts
- POST `/distributions` distributionInput + `{status: draft|completed}` → created; 409 shares_not_100, nothing_to_distribute
  - distributionInput: `{mode period|project|quarter|manual, amount? (manual), paidOn, paidRef, year?, q?, periodType, from, to, label, projectIds[], projectId, pct (0..100, 100), retainedCategory (reserve), note}`
- POST `/distributions/:id/complete` → freeze (409 shares_not_100, stale_draft(+projectId), not_draft)
- POST `/distributions/:id/pay` `{date, ref}` → marks paid (409 not_approved)
- DELETE `/distributions/:id` → drafts only (409 completed_locked)

### 5.18 Finance overview — `/api/finance` RW(treasury.view, treasury.edit)
- GET `/checks` → `{checks[{key,title,hint,rows[{label,detail,link}]}]}` keys: unapproved_receipts «استلامات غير معتمدة», over_contract «مُستلم أكثر من قيمة العقد», partners «حصص الشركاء» (≠100% or duplicates), vat_as_expense «ضريبة مسجّلة كمصروف مشروع», cf_undecided «بنود «الرسوم الإضافية» تنتظر تحديد نوعها», no_tax_invoice «مشتريات من 1,000 ر.س فأكثر بلا فاتورة ضريبية», drafts «مشاريع مسودة لا تُحسب في المالية»
- GET `/overview` ?from,to,client,status → `{period, totals{gross,profit,spent,income,remaining,margin%,projects,withoutFinance,pending,unregistered,received}, projects[], clients[{id,name,projects,gross,profit}], monthly[{month,expense,income}], categories[{label,amount}], obligations{pending[], unregistered[]}, quality}`
- GET `/report` ?from,to → overview + `org{name,reg,tax,urls}`, `generatedAt` (printable)

### 5.19 VAT — `/api/finance/vat` RW(vat.view, vat.edit)
- GET `/settings` → `{rate, period}` ; PATCH `/settings` `{rate 0..100, period}`
- GET `/report` ?year&q | ?year | ?from&to → `{label, sales{rows[{date, project, base, vat, source invoice|receipt}], base, vat, total}, purchases{rows, base, vat}, outputVat, inputVat, netPayable, …warnings}`; 400 period_required
- GET `/year` ?year → each quarter's return, due date, filing status, totals `{netPayable, paid}`
- PUT `/filings/:key` (`2026-Q3`) `{status open|filed|paid, filedOn, paidOn, paidAmount, reference, note}` → freezes output/input/net at that moment
- POST `/convert-entry` `{projectId, entryId, periodKey}` → a `vat` project expense becomes a payment on that period's filing (entry → cancelled with note «نُقل إلى سداد ضريبة …»)
- GET `/invoices` ?projectId → sales invoices ; POST `/invoices` `{projectId, number, date*, amount*(incl VAT), vat?, receiptId, assetId, note}` ; PATCH `/invoices/:id` ; DELETE `/invoices/:id` (archive; 409 project_closed)

### 5.20 Year review — `/api/finance/year-review` [treasury.view]
- GET `/` ?year → `{year, totals{revenue, target, targetSource settings|plan|null, projectReceipts, receiptsVat, companyIncome, unrecorded (owed on completed), collecting (owed on active/paused)}, counts, items[per project]}`

### 5.21 Attention, notifications, reports
- GET `/api/attention` → `{items[{key, tone warn|info, title, count, link}], checklist[{key,label,done,link}]}`; items per perm: «متابعات مبيعات وعملاء حان موعدها», «طلبات عروض لم يُتواصل معها منذ أكثر من 3 أيام», «عروض أسعار تنتهي صلاحيتها خلال 3 أيام», «عروض أُرسلت ولم يُردّ عليها منذ أسبوع», «مستندات بانتظار الاعتماد», «مشاريع جارية تجاوزت تاريخ انتهائها», «حركات مالية معلّقة تنتظر السداد», «أرقام مالية تحتاج تدخلك», «دفعات عملاء تجاوزت موعد استحقاقها», «مهام مسندة إليك تجاوزت موعدها», «اجتماعاتك اليوم», «قرارات مسندة إليك تجاوزت موعدها», «مبادرات في الخطط تجاوزت موعدها», «مراجعة الربع N في الخطة لم تُسجَّل بعد». Setup checklist (org.edit; hidden when all done): «أكمل بيانات الجهة والرقم الضريبي», «أضف أول عميل», «أضف أول مشروع», «انشر أول خدمة», «ادعُ زميلاً إلى المنصة», «ابدأ خطتك التشغيلية».
- GET `/api/notifications` → `{items[], unread}` ; POST `/read-all` ; POST `/:id/read`
- GET `/api/reports/execution` [tasks.view] ?from,to → `{period, totals{open,late,done,onTime,minutes}, people[], projects[]}`

### 5.22 Team & roles — `/api/team`
- GET `/users` [team.view] → `{users[{id,email,name,roleKey,roleName,active,pending,lastLoginAt,createdAt}]}`
- POST `/users` [team.manage] `{email, name, roleKey}` → 201 `{id, setupToken}`; 409 email_taken, 404 role_not_found, 403 (non-owner assigning owner)
- PATCH `/users/:id` [team.manage] `{name?, roleKey?, active?}` → `{}`; 409 last_owner; deactivation signs out everywhere
- POST `/users/:id/reset` [team.manage] → `{setupToken}`
- GET `/roles` [team.view] → `{roles[{key,name,description,perms,scopes,builtin,edited,users}]}`
- POST `/roles` [roles.manage] `{key, name, description, perms[], scopes{projects?}}` → 201 (409 key_taken)
- PUT `/roles/:key` [roles.manage] same minus key (400 owner_fixed) ; DELETE `/roles/:key` (reset built-in / delete custom; 409 role_in_use)
- GET `/projects/:id/members` [projects.view] → `{userIds}` ; PUT `/projects/:id/members` [projects.edit] `{userIds[]≤50}` → `{userIds}`

### 5.23 Org, settings, assets, audit, import, export, PDF
- GET `/api/org/profile` → profile (+urls) ; PATCH `/api/org/profile` [org.edit] `{version, …orgProfile fields}` → `{profile}` (400 invalid_asset; 409 stale)
- GET `/api/org/storage` → `{bytes, files}`
- GET `/api/org/settings` RW(treasury.view, treasury.edit) → `{projectDefaults, projectDefaultsSet, targets{year: riyals}, distributionDefaults{pct, retainedCategory}, cashOpening{amount,date,updatedBy,updatedAt}|null}` ; PATCH `{projectDefaults?, targets?{year: n|null}, cashOpening?|null, distributionDefaults?}`
- GET `/api/org/preferences` (any user) → `{numbering[{kind,label,prefix,defaultPrefix,yearly,next,example}], texts{quoteTerms, quoteValidityDays, letterClosing}}` ; PATCH [org.edit] `{numbering?{kind:{prefix?, next?}}, texts?}` (409 counter_down, 400 unknown_kind)
- GET `/api/org/export` [org.edit] → full JSON backup download `buad-backup-YYYY-MM-DD.json`
- POST `/api/assets` [assets.edit] raw bytes body → 201 `{id, url, deduplicated}` (413 too_large, 415 bad type, 503 storage_unavailable) ; GET `/api/assets/:id` → file (content-addressed, immutable)
- GET `/api/audit` [audit.view] ?entity,user,from,to,limit(≤200,100),before(epoch) → `{items[{…, detail}]}`
- POST `/api/import/v1` [import.run] body = v1 export JSON → import report (idempotent; codes/numbers never change)
- POST `/api/pdf` `{path, name}` → vector PDF of a printable app page (503 pdf_unavailable)

---

## 6. Business rules

### 6.1 Numbering
- Codes from `org_counters` via one atomic UPSERT…RETURNING (never repeats, never reused). Client `CL-0001` (global), project `PRJ-YYYY-0001`, quote `QT-YYYY-…`, contract `CT-YYYY-…`, letter `LT-YYYY-…`, outgoing `ص-YYYY-…` (yearly reset per UTC year). Prefix and next number configurable; next can only increase.
- Document number editable while not approved (unique, `number_taken`). Outgoing number given once, on request, only after approval.

### 6.2 Clients
- Hard duplicates: same CR (reg_no) or VAT no. (tax_no) in the org, archived included → 409 `duplicate`.
- Soft duplicate: normalized name equal (folds tashkeel, tatweel, أإآٱ→ا, ى→ي, ة→ه, ؤ→و, ئ→ي, punctuation, case) → 409 `similar_name` unless `confirmSimilarName`.
- Signatory: first contact with `isSignatory=true`, set via signatoryName/Title.
- Archive client → archives all its live projects (archived_with = client id); restore brings back exactly those. Restoring a project of an archived client refused. New projects for archived clients refused.
- Delete only if it never had projects.
- Relationship (computed, never typed): active project → active; else open request (new..negotiating) or open quote (draft/sent) → prospect; else completed project → former; else no touch for 180 days → dormant; else new.
- Owed per client = Σ over active/completed/paused non-external projects of max(0, contractTotal − approved receipts).

### 6.3 Projects
- Creator becomes owner_id. New projects copy the org's saved contract defaults («الإعدادات ← المالية») into a project_finance row with contractValue = expectedValue; if no saved defaults, no row (built-ins apply on read). External projects get no finance row.
- **In finance** rule (`inFinance`): not archived AND not external AND status ≠ draft. Every total, report, VAT, receivables, targets, checks uses it. Drafts are surfaced in finance checks «مشاريع مسودة لا تُحسب في المالية».
- **Draft projects**: created by conversions (quote/request) with status draft; count nowhere until switched to active.
- **External projects** («مشروع خارجي»): work tracking only; any money write → 409 `project_external`; switching to external refused if entries/receipts/invoices/instalments exist.
- contractTotal (lists): finance row → vat_included ? contract_value : contract_value + round(cv × vat_pct/100); else expected_value + 15% (`estimated: true`).
- Late = status active and end_date < today. Due flag = earliest pending instalment < today.
- `fullyDistributed` = closed and realized profit − completed distributions ≤ 0.5 SAR.
- Service link: package requires product; unknown product/package refused; changing product without package clears package. Stages can be copied from the service's `process` once.
- Delete: owner only; refused (`has_records`) if any finance/doc/task rows reference it.

### 6.4 Project finance calculation (`finCalc`, port of v1; riyals; cancelled entries excluded)
```
cv = contract value; if vatIncluded: net = cv/(1+vat%), vatAmt = cv−net  else net = cv, vatAmt = cv×vat%
grossTotal = net + vatAmt
fee(v,type,base) = fixed ? v : (base=gross ? grossTotal : net) × v/100
execAmt, mkt, cb, cfAmt = fee(...) for exec / mkt / cb / cf
profitMargins = Σ expenses (pct: margin% × amount ; fixed: margin)
execIncomeReg = Σ income entries cat "exec" ; nonExecInc = totalIncome − execIncomeReg
mktShare = mktInternal ? mkt : 0
profit = max(0, (execIncomeReg>0 ? execIncomeReg : execAmt) + profitMargins + nonExecInc + mktShare)
available = grossTotal − execAmt − mkt − cb − cfAmt ; obligations = execAmt+mkt+cb+cfAmt
opExpenses = Σ expenses in opCats ; remainingExec = available − opExpenses
totalSpent = Σ expenses ; remainingFromGross = grossTotal − Σ all entries  (= "unclassified")
missingItems: agreement items with amount>0 but no entry of that cat (Arabic names)
```
Summary keys: cv, vatIncluded, vatPct, vatAmt, contractNet, grossTotal, execAmt, mkt, cb, cfAmt, budgetTotal, available, obligations, opExpenses, remainingExec, totalSpent, remainingFromGross, totalDeductions, opCats, defaultOpCats, totalExpenses, totalIncome, totalAllEntries, execIncomeReg, nonExecInc, profitMargins, profit, remaining, isInternalMkt, missingItems.

### 6.5 Finance entry rules
- Types: income / expense. Categories: built-ins, project custom (`cc_…`, deletable only if unused), budget rows (`bdg_<id>`).
- Agreement registration «من الاتفاقية»: exec → **income** entry (cat exec, «أتعاب التنفيذ»); cf «ضريبة القيمة المضافة», mkt «تسويق», cashback «كاش باك», budget rows → **expense** entries; amount = computed fee; status paid; source agreement; once only (any non-cancelled entry of that cat = registered); "register all" does the missing ones.
- Tax invoice only on expenses; VAT default = amount × rate/(100+rate) (15/115 = 13.043%) at the org's current rate, stored and never recomputed; capped at amount.
- `cf` entries need cf_kind (vat = contract VAT reserved for ZATCA, fee = real fee); undecided are flagged.
- A `vat` category expense (tax paid to ZATCA) is flagged and can be converted into a VAT filing payment.
- Entries with status "" (v1 imports) can be bulk-marked paid/pending. Pending expenses feed the cash forecast outflows.
- Contract value locked when `cvLocked` (409 cv_locked).

### 6.6 Receipts & receivables
- A receipt counts only when approved; saving one in v2 auto-approves (approved_by = saver). Negative = refund. Warning (409 over_contract) if received + new > gross unless `confirmOver`.
- Receipt cannot be deleted if a completed distribution covered its date (`in_distribution`); deleting reopens a schedule line it paid.
- Schedule lines are gross amounts; receiving creates the approved receipt atomically (double-tap safe); partial receipt splits the line (rest «(المتبقي)», same due date). Received lines can't be edited/deleted.
- Aging by days past due: current / 1–30 / 31–60 / 61–90 / 90+. Cash forecast: 13 weeks from today, opening balance (query or settings `cash_opening`), inflows = pending lines, outflows = pending expenses; overdue/undated land in week 1; first negative week = shortfall.
- Reminder text template (WhatsApp): «السلام عليكم {client}،\nنذكّركم بدفعة «{label}» لمشروع «{project}» بمبلغ {amount}، وتاريخ استحقاقها {dueDate}.\nنشكر لكم تعاونكم.\n{org}».

### 6.7 VAT (15% default; ZATCA)
- Default rate 15% everywhere (org_vat_settings.rate, project vat_pct, quote vat_pct). Rate change affects new purchases only.
- Output VAT: from sales invoices by invoice date; a project without invoices falls back to approved receipts, each carrying VAT ∝ contract (receipt × vatAmt/gross), by receipt date (flagged source "receipt").
- Input VAT: expenses with tax_invoice by invoice date (else entry date), plus company purchases. Excluded "not purchases": salary, exec, cashback, cf, vat (project); payroll, zakat, gov_fees (company).
- Return = output − input (negative = refundable). Valid supplier VAT no. regex `^3\d{13}3$`. Quarter due date = last day of month after the quarter (Q4 → 31 Jan next year). Filing freezes figures; status open → filed → paid.

### 6.8 Project close «إغلاق المشروع»
- Needs finance.edit. Shows figures, VAT, warnings (remaining owed, unapproved receipts, pending entries, no sales invoice, invoices below receipts, purchases without invoice, cf undecided, VAT as expense) — warnings only, closing allowed.
- Close sets status completed + closed_at; entries, receipts, terms, schedule receive, invoices then locked (409 project_closed) until reopened with a reason (≥3 chars). External projects can't be closed.

### 6.9 Realized profit & distributions
- realized = profit × min(1, received/gross) (0 if any ≤0). Profit is realized as money arrives.
- Company result = project profits (only active/completed projects earn) + service income − company expenses. Income period by payment_date.
- Distribution modes: period (all realized & unsettled + company net), project (one project's undistributed realized profit), quarter (quarter's realized), manual (past distribution by actual amount). distributed = available × pct; retained (ops/dev/reserve) = rest. Split by partner share (largest remainder; rounding halalas to largest share). Partners must total exactly 100%.
- Draft → completed (frozen; shares and per-project amounts copied; stale drafts refused) → paid (date + ref). Only drafts deletable. The same project profit is never distributed twice (distribution_projects).

### 6.10 Sales pipeline (opportunities)
- Stages new → contacted → quoted → negotiating → won | lost. Each move stamps stage_changed_at and writes a `stage` CRM activity «من «X» إلى «Y»» (+ « — reason» for lost).
- Logging a contact on a `new` opportunity → contacted. First work on a website enquiry auto-links/creates the client (same normalized name, else new client type association, note «أُنشئ تلقائياً عند أول تواصل مع فرصة»).
- Pricing a request (PUT quote) computes price from the product's private pricing × times, VAT at org rate; moves new/contacted → quoted; fills value if empty.
- Weighted pipeline = Σ value × stage probability. Stale = open and untouched > 7 days. Win rate = won/(won+lost). Follow-up "soon" = within 7 days.
- Website enquiries: `source=site`, rate-limited, honeypot, required intake answers; comingSoon products count as "interest".

### 6.11 Quotes → project conversion
- Totals: subtotal = Σ round(qty × unit); discount ≤ subtotal; net = subtotal − discount; VAT = round(net × vat%); total = net + VAT.
- Status flow: draft→sent (needs ≥1 item); sent→draft/accepted/rejected; rejected→draft/sent; accepted is final & locked. Can't accept after valid_until (`expired`). Sending moves linked request forward to quoted (never backwards) and sets a follow-up in 5 days if none. Accepting moves it to negotiating.
- Duplicate = new number, draft, validity cleared. Delete only drafts.
- Convert (accepted only, once): client = given / quote's / request's, else new client (type association, from entity/recipient, note «أُنشئ من عرض السعر QT-…»; similar-name check); project = **draft**, type other, name = projectName or quote title, expectedValue = quote **net** (pre-VAT; project adds VAT), notes «من عرض السعر …», service link from quote; payment schedule from `scheduleSplit(kind, total gross, today)`: full = 100% at +30d; half = 50% now + 50% at +60d; thirds = 40% now + 30% +30d + 30% +60d (last line takes rounding); request → won.
- Request convert (without quote): draft project at quote.price (pre-VAT), name «<product> — <entity>», notes = package × times + answers + message; request → won.

### 6.12 Documents
- Status: draft → review (notifies documents.edit users) → approved (snapshot into document_versions; locked from edit). approved → draft reopens a new working version; history kept. Share links only for approved docs, show last approved version, expire 7/30 days, revocable, views counted, token stored as SHA-256 only.
- Delete only drafts never approved. Variables auto-filled from org profile, client, project, finance (e.g. contract_no).

### 6.13 Tasks, plans, workspace
- Task done sets done_at; assignment notifies assignee. Time entries never affect finance.
- Objective progress = average of (mean indicator attainment) and (mean initiative completion); initiative completion = tasks done/total if tasks, else status weight. Cycle progress = weight-averaged. Plan status vs elapsed share: gap ≤10% on_track, ≤25% at_risk, else late. Attainment = (current−baseline)/(target−baseline) clamped 0..1.
- Meetings: attendees edit minutes/status; organiser edits the rest/deletes. Held meeting linked to client/opportunity logs a CRM «اجتماع» once. Decisions convertible to a task (same owner, due, project).

### 6.14 Settings & misc
- Org settings: project defaults (VAT/fees for new projects), yearly revenue targets (riyals incl. VAT; year-review uses settings target, else plan's revenue indicator), cash opening balance, distribution defaults (pct 100, reserve).
- Doc texts: default quote terms, quote validity days (0 = none), letter closing.
- Every export/print is logged (`POST /api/exports`). Full backup via `/api/org/export`.
- Notifications are deduped per (user, dedupeKey) and never fail the main write.
