# 03 — Screens & UX reference («بُعد» v2 web app → iOS prototype)

Source: `v2/apps/web/src` (React 19 + Tailwind 4 + TanStack Router/Query). Everything RTL (`dir="rtl"`).
All Arabic strings below are copied verbatim from the code. `«…»` = literal UI text. `{x}` = interpolated value.
Endpoints are relative to the same origin (`/api/...`). Money from API is mostly **halalas** (÷100) unless noted.

---------------------------------------------------------------------------------------------------

## 0. Global conventions

### 0.1 Formatting (`lib/format.ts`)
- Locale: `ar-SA` with **Latin digits** (`-u-nu-latn`) and **Gregorian** calendar (`-u-ca-gregory`). Never Arabic-Indic digits.
- `money(halalas)` → `Intl.NumberFormat("ar-SA-u-nu-latn",{style:"currency",currency:"SAR"})` e.g. «50,000.00 ر.س.» (domain formatSar, 2 decimals).
- `sar(riyals)` → whole amounts without decimals «50,000 ر.س.», with halalas «33,333.33 ر.س.» (never «.00»).
- `moneyShort(halalas)` → compact for cards: «30 ألف ر.س» / «1.2 مليون ر.س».
- `pct(v)` → «12.5%» (1 decimal).
- `day("2026-03-01")` → «1 مارس 2026» (day numeric, month long, year). Empty string stays empty.
- `monthOf(iso)` → «مارس 2026».
- `fromEpoch(sec)` → same as `day` from epoch seconds.
- `ago(sec)` → relative Arabic: «منذ 3 أيام», «أمس», «الآن» (`Intl.RelativeTimeFormat("ar",{numeric:"auto"})`).
- Home page long date: weekday + day + month + year, e.g. «الاثنين، 9 نوفمبر 2026».
- Activity log time: «17 أكتوبر 2026، 8:21 ص».
- Codes/numbers (project number `PRJ-2026-0003`, client code, phone, IBAN, tax no.) are rendered `dir="ltr"`.
- Saudi mobile → WhatsApp link `https://wa.me/9665XXXXXXXX` (accepts 05xxxxxxxx / 5xxxxxxxx / 00966…).
- Quarter names: «الربع الأول», «الربع الثاني», «الربع الثالث», «الربع الرابع»; label = «الربع الثاني 2026». Short chips: «ر1» … «ر4».
- Task hours: «2 س 30 د», «2 س», «45 د».
- Arrows in ranges use «←» (RTL reading): «1 مارس 2026 ← 30 يونيو 2026», open end «مفتوح».
- Pipeline subtitle uses «←» as "then": «جديد ← مؤهَّل ← عرض سعر ← تفاوض ← مكسوب».

### 0.2 Design tokens (`index.css`)
- Font: «IBM Plex Sans Arabic» (400/500/600/700), fallback Segoe UI/Tahoma.
- Light: brand (primary buttons, ink) `#171717`, brand-strong `#000`, brand-soft `#eeece8`, accent (orange: active tab bar indicator, focus, progress) `#f5a524`, accent-soft `#fdf0d9`, accent-ink `#9a5800`, surface `#ffffff`, canvas (page bg) `#f4f3f1`, chrome (header) `#ffffff`, ink `#171717`, muted `#66635e`, line `#e7e4df`.
- Status: success `#16a34a` / soft `#ecfdf3` / ink `#157f3c`; warning `#d97706` / soft `#fff7e6` / ink `#9a5800`; danger `#dc2626` / soft `#fef2f2` / ink `#b91c1c`.
- Charts: series-1 `#2a78d6`, series-2 `#eb6834`.
- Dark (`<html data-theme="dark">`): brand `#f2f2f2`, brand-soft `#262626`, surface `#1a1a1a`, canvas `#0b0b0b`, chrome `#141414`, ink `#f2f2f2`, muted `#a8a6a2`, line `#2c2b29`, success-ink `#4ade80`, warning-ink `#fbbf24`, danger-ink `#f87171`. In dark, primary button text is canvas colour (dark on light button).
- Radii: card `1.25rem` (20px), control `0.75rem`; buttons/inputs `rounded-lg` (8px); dialogs `rounded-2xl`, phone sheet `rounded-t-2xl`.
- Shadows: card `0 1px 2px rgb(0 0 0/.04)`; raised `0 8px 24px rgb(0 0 0/.12)`.
- Greys are warm-neutral (slate overridden: 50 `#faf9f7`, 100 `#f1f0ed`, 200 `#e4e2de`, 500 `#77736c`, 800 `#262524`).
- Login/brand panel navy: `#00197d` (logo navy).
- Theme modes: «النمط النهاري» / «النمط الليلي» / «حسب الجهاز» (short: «نهاري» «ليلي» «حسب الجهاز»; hints «خلفية فاتحة», «خلفية داكنة مريحة للعين», «يتبع إعداد جهازك»).

### 0.3 UI primitives (`components/ui.tsx`)
- **Button** variants: `primary` (brand fill, white text), `secondary` (border + surface), `ghost` (muted text), `danger` (red fill). Min height 44px on phone (`min-h-11`), 40px desktop. Icon (lucide, 16px) + label, gap 8px.
- **Field**: label (bold, 14px) above control; hint (12px muted) or error (12px danger-ink) below. Inputs 16px text on phone (no iOS zoom), 14px desktop; border line; focus ring accent.
- **SearchBox**: search icon on the right (RTL start), placeholder text, type=search.
- **Badge** tones: `gray` (slate-100/slate-700), `green` (success-soft/success-ink), `blue` (brand-soft/brand — i.e. neutral beige with black text in this palette), `amber` (warning-soft/warning-ink), `red` (danger-soft/danger-ink). Pill, 12px, px-2.5.
- **BadgeMenu**: a badge with a ▾ chevron that opens a small menu of other badges (status changer). Aria «حالة {name}: {label} — تغيير».
- **Stamp**: tilted (−3°) double-bordered office stamp, bold 12px. kinds: `closed` (slate) e.g. «مغلق»; `distributed` (green) e.g. «موزّع بالكامل» / «موزّع»; `partial` (amber) «موزّع جزئياً · بقي {sar}».
- **Card**: rounded-card, border line, surface, padding 20px.
- **Avatar**: logo image or first letter on brand-soft tile (rounded-xl). Sizes xs 24px, md 44px, lg 64px. Empty name → «؟».
- **EmptyState**: dashed rounded box, centred title (18px semibold), optional text (muted), optional action button.
- **PageHeader**: H1 24px bold + subtitle muted 14px; actions on the end (left in RTL). `moreActions` → a «⋯» menu shown only on phones.
- **Pills**: horizontal scrolling chips; active = brand fill white text; each may show a count (opacity 70%). Default first pill «الكل».
- **Segmented**: rounded-xl bordered strip of buttons; active = brand fill white; may carry an icon and a «قريباً» chip. On phone takes full width (unless `inline`) and scrolls sideways with fading edges.
- **Tabs**: underline tabs (active = 2px brand underline, semibold). Disabled tab shows «(قريباً)».
- **LayoutToggle**: icon segmented control (aria «طريقة العرض»), e.g. قائمة / لوحة / جدول.
- **ViewToggle**: grid/list icons: «عرض شبكي», «عرض قائمة».
- **Notice** (inline banner): `red` (alert), `amber`, `blue` (status). 14px, rounded-lg.
- **Dialog**: phone = bottom sheet (full width, max 88dvh, rounded top, safe-area padding); desktop = centred modal (max-w-lg, `wide` = max-w-2xl). Title bar with ✕ («إغلاق»). Scrolling body; sticky footer. If the form is dirty and the user closes by ✕/backdrop/Esc → confirm «تجاهل التعديلات غير المحفوظة؟» / «ما كتبتموه في هذه النافذة لم يُحفظ بعد.» / button «تجاهل التعديلات» (danger).
- **DialogActions** (footer): primary first (rightmost; full-width stacked on phone), then ghost «إلغاء», then optional destructive aside at far end.
- **confirmAction** (one global confirm dialog): title, optional text, action button named after the action (never «موافق»), plus «إلغاء». Default action label «تأكيد».
- **toast**: short line at the bottom that disappears by itself; tone ok/error. E.g. «حُفظ».
- **Menu** («⋯» button, aria default «المزيد»): grouped items with icons, optional `section` headers, separators, optional per-item hint (second line muted), `danger` items in red.
- **Sheet**: side sheet from inline-end (left in RTL) on desktop, full screen on phone; title + description; for settings revisited rarely (e.g. «إعدادات العقد والميزانية»).
- **Info**: dt (12px muted) / dd; empty → «—».
- **StatTile** (`components/StatTile.tsx`): label (12px muted), value (bold, tabular), optional hint line, optional tone (good=green, bad=red, warn=amber), optional delta «▲ 12% عن {prev}» / «▼ …» / «بلا تغيّر عن {label}» / «▲ جديد عن …». `as="cell"` → joined strip of tiles separated by 1px gaps inside a rounded-2xl border (used for KPI strips).
- **DataTable**: desktop table (sortable headers, 44px rows); on phone (`<md`) each row becomes a list item: title cell then up to 3 figure cells in a 3-column `dl` (label above value).
- **FilterBar**: desktop → inline selects; phone → ONE «تصفية» button (with count of active) opening a bottom sheet titled «تصفية» of big tap-able choices, buttons «عرض النتائج» and «مسح»; active filters shown as removable chips (aria «إزالة {label}: {value}») + «مسح الكل».
- **StepNav** (phone multi-step editors): «الخطوة 3 من 8 · {name}», progress bar, «السابق»/«التالي», a dialog «الانتقال إلى خطوة».
- **Loading/Errors** (`Resilience.tsx`): skeleton blocks (aria «جارٍ تحميل الصفحة»); section error card «تعذّر عرض «{label}»» with «بقية الصفحة تعمل. أعد المحاولة، وإن تكرّر الخطأ فأبلغ مسؤول المنصة.» and buttons «إعادة المحاولة», «الرئيسية». Page error: «تعذّر عرض هذه الصفحة».
- Update banner: «صدرت نسخة جديدة من المنصة.» + «تحديث الآن».
- Common error strings: «تعذّر الحفظ، حاولوا مرة أخرى», «تعذّر الحفظ، حاول مرة أخرى.», «إعادة المحاولة», «جارٍ التحميل…», «جارٍ الحفظ…», «حُفظ ✓», «تعديلات غير محفوظة…», «يُحفظ تلقائياً».
- Generic list empty-search: title «لا نتائج», text «جرّبوا كلمة بحث أخرى أو أزيلوا عامل التصفية.»

### 0.4 Shared status vocabularies & tones
- Project status (`PROJECT_STATUS_LABELS` / `STATUS_TONE`): draft «مسودة» gray · active «جاري التنفيذ» green · completed «مكتمل» blue · paused «متوقف» amber · cancelled «ملغي» red.
- Project type: training «تدريب» · consulting «استشارات» · event «فعالية» · other «أخرى».
- Client type: company «شركة» · association «جمعية» · government «جهة حكومية» · individual «فرد» · other «أخرى».
- Client relationship (computed): active «عميل نشط» green · prospect «محتمل» blue · former «عميل سابق» gray · dormant «خامل» amber · new «جديد» gray.
- Client/lead source: site «الموقع» · referral «إحالة» · event «معرض أو فعالية» · call «اتصال وارد» · social «تواصل اجتماعي» · other «أخرى».
- Contact activity types: call «اتصال» · meeting «اجتماع» · visit «زيارة» · email «بريد» · whatsapp «واتساب» · note «ملاحظة»; timeline stage change «تغيّر المرحلة».
- Follow-up state: overdue «متأخرة» · today «اليوم» · soon «هذا الأسبوع» · later «لاحقاً».
- Sales stages (`STAGE_LABEL`): new «جديد» · contacted «مؤهَّل» · quoted «عرض سعر» · negotiating «تفاوض» · won «مكسوب» · lost «خاسر».
  - hints: «وصل الطلب ولم نتواصل بعد», «تواصلنا وفهمنا الحاجة», «أرسلنا عرض سعر», «نناقش السعر والشروط», «تم الاتفاق والتعاقد», «لم تكتمل».
  - probabilities (weighted value): new 10%, contacted 20%, quoted 40%, negotiating 65%.
  - tones on cards: new gray, contacted blue, quoted blue, negotiating amber, won green, lost red (table view: new/contacted blue, quoted/negotiating amber, won green, lost gray).
  - «راكدة» (amber) = open & no change for 7+ days.
- Quote status: draft «مسودة» gray · sent «أُرسل» blue · accepted «مقبول» green · rejected «مرفوض» red; expired sent → «منتهٍ» red.
- Document status: draft «مسودة» gray · review «قيد المراجعة» amber · approved «معتمد» green. Kind: contract «عقد», letter «خطاب», quote «عرض سعر». Stepper: «مسودة ← مراجعة ← معتمد ← صادر».
- Task status: todo «لم تبدأ» gray · doing «قيد التنفيذ» blue · blocked «معلّقة» amber · done «منجزة» green. Priority: low «منخفضة» · normal «عادية» · high «عالية» (red badge when high).
- Stage (project phase) status cycles on tap: «لم تبدأ» → «قيد التنفيذ» → «منجزة» → back.
- Meeting status: scheduled «مجدول» · done «عُقد» (green) · cancelled «أُلغي» (gray).
- Decision status: open «مفتوح» · done «نُفّذ» (green) · cancelled «أُلغي» (gray).
- Finance entry status: paid «مدفوع» · pending «معلق» · cancelled «ملغي»; empty «—».
- Entry categories: salary «رواتب» · logistics «لوجستيات» · materials «مواد» · other «أخرى» · exec «أتعاب» · mkt «تسويق» · cashback «كاش باك» · cf «رسوم إضافية» · vat «ضريبة».
- Company categories: project_fee «أتعاب مشروع», subscription «رسوم اشتراك», setup «رسوم إعداد وتشغيل», consulting «خدمات استشارية», commission «عمولات», hosting «استضافة وبنية تحتية», marketing «تسويق وإعلان», payroll «رواتب وأجور», tools «خدمات وأدوات», legal «قانونية وإدارية», asset «أصل رأسمالي (أجهزة، أثاث…)», purchase «مشتريات عامة», zakat «زكاة», gov_fees «رسوم حكومية», other «أخرى».
- Retained categories: ops «تشغيل» · dev «تطوير» · reserve «احتياطي».
- VAT filing status: open «مفتوح» gray · filed «قُدِّم» amber · paid «سُدِّد» green.
- Aging buckets: «غير مستحقة», «1–30 يوماً», «31–60 يوماً», «61–90 يوماً», «أكثر من 90 يوماً» (last one red when > 0).
- Product status: draft «مسودة» gray · published «منشور» green · archived «مؤرشف» amber.
- Plan status: draft «مسودة» · active «جارية» · closed «مغلقة». Initiative status: «لم تبدأ», «قيد التنفيذ», «متعثرة», «منجزة».
- Roles (built-in): «المالك» («كل شيء، ولا يمكن تقييده.»), «المدير العام» («إدارة العمل كاملة عدا الحذف النهائي والاستيراد وتعديل الأدوار.»), «المدير المالي» («المالية والضريبة والشركاء مع اطلاع على المشاريع والعملاء.»), «مدير مشاريع» («يدير العملاء والمشاريع ومالية المشروع دون أرباح الشركة.»), «مبيعات وعلاقات عملاء» («العملاء والطلبات والعروض، بلا أرقام الأرباح.»), «محاسب» («إدخال المصروفات والمقبوضات والضريبة دون تعديل العقود.»), «عضو فريق» («يعمل على مشاريع الفريق ويرى ماليتها دون الأرباح.»), «مشاهد» («قراءة فقط.»).
- Permission keys used for gating (examples): `clients.view/edit`, `projects.view/edit`, `documents.view/edit`, `finance.edit` (project finance), `treasury.view` (org finance), `sales.view/edit`, `tasks.view/edit`, `meetings.view/edit`, `plans.view/edit`, `products.view`, `site.view`, `team.view/manage`, `audit.view`, `org.edit`, `import.run`. Project scopes: «كل المشاريع» / «مشاريع الفريق» / «مشاريعي فقط».

---------------------------------------------------------------------------------------------------

## 1. Routes (router.tsx → component)

Signed-out / standalone (no app chrome):
- `/login` → LoginPage (redirects to `/` if signed in). `?token=` = invite / password-set link.
- `/recover` → RecoverPage («استعادة الدخول»).
- `/setup` → SetupPage (first-time owner; only when server needs setup).
- `/s/$token` → PublicDocumentPage (shared document, no sign-in).
- `/print/documents/$docId`, `/print/quotes/$id`, `/print/finance/$projectId`, `/print/products/$id` → print pages.
- `/site`, `/site/p/$slug`, `/site/p/$slug/brochure` → public website (SitePage, ProductPublicPage, brochure).

Signed-in (inside AppShell):
- `/` → Home («اليوم»).
- `/more` → MoreIndex (phone «المزيد» hub page; bottom bar normally opens the drawer instead).
- `/more/soon/$key` → ComingSoon tool detail; `/soon` → SoonPage (list of «قريباً» tools).
- `/tasks` → TasksPage (perm tasks.view). Search: `scope=mine|all`, `show=open|late|done`, `layout=list|board|table`, `q`, `project`, legacy `mine`.
- `/meetings` → MeetingsPage (meetings.view). `?open={meetingId}` opens its detail dialog.
- `/decisions` → DecisionsPage (meetings.view). `?mine=1`, `?show=open|late|done`.
- `/sales` → OpportunitiesPage (sales.view).
- `/sales/$id` → OpportunityPage.
- `/sales/quotes` → QuotesPage (SalesPage.tsx).
- `/sales/followups` → FollowupsPage (clients.view).
- `/sales/analytics` → SalesDashboard (`from`,`to`).
- `/clients` → ClientsPage. Search: `q`, `sort=newest|name|value|contact`, `view=grid|list`, `archived`, `type`, `rel=active|prospect|former|dormant|new`, `owner`, `followup=due`.
- `/clients/$id` → ClientPage (`tab=overview|projects|crm`).
- `/clients/$id/statement` → StatementPage («كشف حساب»).
- `/projects` → ProjectsPage. Search: `q`, `sort=newest|name|value|deadline`, `view`, `archived`, `status`, `product`, `type`, `flag=late|due`, `external=0|1`.
- `/projects/$id` → ProjectPage (`view=finance|documents|execution`; default finance).
- `/projects/$id/documents/$docId` → DocumentEditor.
- `/documents` → DocumentsPage. Search: `q`, `kind=contract|letter|quote`, `status=draft|review|approved|outgoing|sent|accepted|rejected`, `client`, `period=30|90|year`, `view=outgoing`.
- `/finance` → FinancePage (treasury.view). `tab=overview|receivables|vat|profit` (legacy review/projects→overview, quarter/company/partners→profit). Period: `preset=all|year|last|quarter|custom`, `year`, `q`, `from`, `to`, `client`, `status`; profit tab own period `py`, `pq` (0=whole year).
- `/finance/report` → ReportPage (finance report); `/finance/vat/report?year&q` → VatReportPage.
- `/reports` → ReportsPage; `/reports/portfolio` → PortfolioReport; `/reports/execution` → ExecutionReport.
- `/plans` → PlansPage (plans.view).
- `/products` → ProductsPage (`?tab=requests` redirects to /sales); `/products/$id` → ProductBuilderPage.
- `/website` → WebsiteEditorPage.
- `/settings` (layout) → children: `/` SettingsHome, `/org` OrgSettingsPage, `/finance` FinanceSettingsPage, `/data` DataPage, `/quality` QualityPage, `/import` ImportPage (import.run), `/team` TeamPage, `/activity` ActivityPage, `/account` AccountPage, `/appearance` → redirects to `/settings/account`.
- Redirects: `/more/plans`→`/plans`, `/more/tasks`→`/tasks`, `/more/sales`→`/sales`, `/sales/pipeline`→`/sales`, `/more/team`→`/settings/team`, `/more/activity`→`/settings/activity`, `/more/receivables`→`/finance?tab=receivables`, `/import`→`/settings/import`, `/account`→`/settings/account`.
- Guards: no session → `/login`; missing perm → `/`.

---------------------------------------------------------------------------------------------------

## 2. App shell & navigation

### 2.1 Section / tab registry (`features/more/tabs.ts`) — verbatim
Each section: key · label · short · route · lucide icon · tint · perm · attention keys · hint. Tabs: key · label · route(+search) · perm · attention · desc · when.

1. **home** · «مساحة العمل» · short «اليوم» · `/` · `LayoutDashboard` · indigo · hint «يومك: مهامك واجتماعاتك وقراراتك وما يحتاج انتباهك»
   - today · «اليوم» · `/` · desc «ما يحتاج انتباهك اليوم، ومهامك، وأرقامك.» · when «أول ما تبدأ يومك.»
   - tasks · «مهامي» · `/tasks` · perm tasks.view · attention [tasks] · desc «مهامك ومهام الفريق عبر المشاريع وعمل الشركة، ومن المسؤول عنها وموعدها.» · when «يومياً: لمعرفة ما عليك وما تأخّر.»
   - meetings · «الاجتماعات» · `/meetings` · perm meetings.view · desc «مواعيد الاجتماعات وحضورها ومحاضرها، مرتبطة بعميل أو فرصة أو مشروع.» · when «قبل الاجتماع لتجهيزه، وبعده لتدوين المحضر والقرارات.»
   - decisions · «القرارات» · `/decisions` · perm meetings.view · attention [decisions] · desc «ما تقرّر ومن المسؤول عنه وموعده، وتحويله إلى مهمة تُتابَع.» · when «بعد كل اجتماع، وأسبوعياً لمتابعة التنفيذ.»
2. **sales** · «المبيعات» · `/sales` · `ShoppingCart` · emerald · hint «الفرص والعملاء وعروض الأسعار» · `single: true` (if only one tab allowed, the section becomes that tab, icon `Users`)
   - opportunities · «الفرص» · `/sales` · perm sales.view · attention [requests, followups] · desc «قمع المبيعات من أول تواصل حتى التعاقد: كانبان أو قائمة أو جدول، ومنها العروض والتحليلات.» · when «كل صباح، وعند وصول طلب جديد أو متابعة فرصة.» (also matches /sales/quotes, /sales/analytics, /sales/followups)
   - clients · «العملاء» · `/clients` · perm clients.view · desc «ملفات العملاء وجهات الاتصال والمشاريع وكشوف الحسابات.» · when «عند إضافة عميل أو البحث عن ملفه.»
3. **projects** · «المشاريع» · `/projects` · `Briefcase` · sky · perm projects.view · attention [overdue] · hint «المشاريع ومراحلها وماليتها وتنفيذها» (no tabs)
4. **documents** · «المستندات» · `/documents` · `Files` · amber · perm documents.view · attention [docs] · hint «العقود والخطابات وعروض الأسعار، مسودةً وصادرةً»
5. **finance** · «المالية» · `/finance` · `Landmark` · teal · perm treasury.view · strip:false (own in-page Segmented) · hint «النظرة العامة والتحصيل والضريبة والأرباح والتوزيع»
   - overview · «نظرة عامة» · `/finance` · desc «المستهدف، وربحية المشاريع، وما يحتاج مراجعة.» · when «للاطمئنان على السنة والمشاريع.»
   - receivables · «التحصيل» · `/finance?tab=receivables` · attention [instalments] · desc «المقبوضات للاعتماد، والدفعات المنتظرة، وتوقّع النقد.» · when «أسبوعياً: لمعرفة من يجب متابعته.»
   - vat · «الضريبة» · `?tab=vat` · desc «ضريبة القيمة المضافة: المبيعات والمشتريات والمستحق للهيئة.» · when «عند تجهيز الإقرار.»
   - profit · «الأرباح والتوزيع» · `?tab=profit` · desc «ما تحقّق في الربع، وإيرادات الشركة ومصروفاتها، والشركاء والتوزيعات.» · when «عند إقفال الربع والتوزيع.»
6. **reports** · «التقارير» · `/reports` · `BarChart3` · rose · hint «كل التقارير في مكان واحد: المالية والمشاريع والمبيعات والخطط»
7. **planning** · «التخطيط» · `/plans` · `Target` · violet · hint «الخطط وما نقدّمه من خدمات وكيف نعرضه»
   - plans · «الخطط» · `/plans` · perm plans.view · attention [initiatives] · desc «الخطة الاستراتيجية والتشغيلية بأهدافها ومؤشراتها.» · when «عند وضع أهداف السنة أو مراجعة التقدّم كل ربع.»
   - products · «المنتجات والخدمات» · `/products` · perm products.view · desc «ما تقدّمه الشركة: الباقات والتسعير الداخلي وأداء كل خدمة.» · when «عند تعديل خدمة أو تسعيرها أو قراءة أدائها.»
   - website · «الموقع» · `/website` · perm site.view · desc «الموقع التعريفي العام: المحتوى والمعاينة والنشر وسجل النسخ.» · when «عند تحديث الموقع أو نشر تغيير.»
8. **settings** · «الإعدادات» · `/settings` · `Settings` · slate · strip:false · hint «بيانات الجهة والفريق والصلاحيات وسجل النشاط وحسابي»
   - overview «نظرة عامة» `/settings` · desc «أقسام الإعدادات وما ينقص كل قسم.» · when «عند الإعداد الأول أو للتأكد من اكتمال البيانات.»
   - org «بيانات الجهة» `/settings/org` · desc «الهوية والترويسة والختم.» · when «عند تغيير بيانات الجهة.»
   - finance «المالية» `/settings/finance` · perm treasury.view · desc «مستهدف السنة، والرصيد الافتتاحي، وشروط المشاريع الجديدة، والضريبة.» · when «في بداية السنة، أو عند تغيّر سياسة الأتعاب أو الضريبة.»
   - team «الفريق والصلاحيات» `/settings/team` · perm team.view · desc «المستخدمون والأدوار وما يراه كل دور.» · when «عند انضمام موظف أو تغيير مسؤولياته.»
   - activity «سجل النشاط» `/settings/activity` · perm audit.view · desc «من غيّر ماذا ومتى.» · when «عند مراجعة تعديل.»
   - data «البيانات» `/settings/data` (+ /settings/import) · perm org.edit · desc «نسخة كاملة للحفظ، والقوائم في Excel، والاستيراد.» · when «للاحتفاظ بنسخة دورية، أو عند نقل بيانات.»
   - quality «الجودة والامتثال» `/settings/quality` · perm org.edit · desc «ما تلتزم به المنصة في الإتاحة والجوال والتصميم والأمان، وأين يقف كل بند.» · when «عند مراجعة جودة المنصة.»
   - account «حسابي» `/settings/account` · desc «كلمة المرور ونمط الألوان على هذا الجهاز.» · when «عند تغيير كلمة المرور أو المظهر.»
   - Settings page icons: overview `LayoutGrid`, org `Building2`, finance `Landmark`, team `ShieldCheck`, activity `History`, data `Database`, import `FileUp`, account `KeyRound`.
9. **soon** · «قريباً» · `/soon` · `Clock` · slate · hint «أدوات قادمة نعمل عليها»

- `LOWER_SECTIONS` = settings, soon (bottom of sidebar, under a divider; not in phone bar).
- **`PHONE_CORE` = home, sales, projects, finance** → bottom bar items use `short ?? label`: «اليوم», «المبيعات» (or «العملاء» when single), «المشاريع», «المالية», then «المزيد» (icon `Menu`).
- Tints (icon tiles): indigo/emerald/sky/amber/teal/violet/rose/slate, each = 50-wash background + 600 ink.

«قريباً» tools (SOON_TOOLS; route `/more/soon/{key}`; detail shows «ما الذي سيحتويه» list and «متى تستخدمه: {when}»; back link «← قريباً»):
- suppliers «الموردون والمشتريات» (Truck) — desc «دليل الموردين وأوامر الشراء وربطها بمصروفات المشاريع.» · when «عندما تتكرر المشتريات ويلزم مقارنة الأسعار.» · will «ملف لكل مورد وتقييمه.» «أمر شراء يتحول إلى مصروف.» «مقارنة أسعار الموردين لنفس البند.»
- hr «الموارد البشرية» (UserSquare) — «ملفات الموظفين والعقود والإجازات والعهد.» · «عند توسّع الفريق.» · «ملف موظف بالعقد والوثائق.» «طلبات الإجازة واعتمادها.» «العُهد والتجهيزات.»
- compliance «الامتثال والوثائق» (CalendarCheck) — «تواريخ انتهاء السجل والشهادات والتراخيص مع تنبيه قبل الانتهاء.» · «لتفادي انتهاء وثيقة دون انتباه.» · «سجل بكل وثيقة وتاريخ انتهائها.» «تنبيه قبل 60 و30 يوماً.» «إرفاق الملف الأصلي.»
- knowledge «المعرفة والقوالب» (BookOpen) — «دليل العمل والقوالب والعروض السابقة لتسريع التسليم.» · «عند بدء مشروع يشبه مشروعاً سابقاً.» · «قوالب جاهزة لكل خدمة.» «أدلة إجرائية.» «دروس مستفادة من المشاريع.»
- portal «بوابة العميل والمانح» (Users) — «صفحة يرى فيها العميل أو المانح تقدّم مشروعه ومستنداته ودفعاته.» · «لتقليل المتابعات اليدوية وزيادة الثقة.» · «رابط آمن لكل عميل.» «تقدّم المشروع والمستندات المعتمدة.» «كشف حساب ودفعات.»
- einvoice «الفواتير الإلكترونية» (Receipt) — «إصدار فواتير متوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك.» · «عند تطبيق مرحلة الربط الخاصة بالمنشأة.» · «فاتورة بتنسيق معتمد ورمز QR.» «ربط مع إقرار الضريبة.» «حفظ ومطابقة مع المقبوضات.»
- Soon page header: «قريباً» / «أدوات نعمل عليها. تظهر هنا فور جاهزيتها.»; unknown key: «هذا القسم غير موجود» + «العودة إلى «قريباً»».

### 2.2 Shell layout (AppShell)
- Skip link «تخطَّ إلى المحتوى».
- **Desktop (≥lg)**: left-side (RTL: right edge) RailSidebar: icon rail always visible + foldable panel (w-60) with the current section's pages (title = section label or «بُعد»; nav «صفحات {section}»). Fold button «طيّ القائمة» / «توسيع القائمة».
- Full Sidebar (also used in phone drawer): top = UserMenu (avatar initial, name, role; menu items «حسابي وكلمة المرور», «تسجيل الخروج») + QuickCreate button «إنشاء جديد»; middle = sections with drop-down pages and badge counts; «الأخيرة» (recent records: client/project/opportunity/document/meeting icons); bottom group (settings, soon).
- Badge colours in nav: red for warn counts, calm grey for info counts.
- **Header** (sticky, 56px, chrome bg, blur): on phone the logo icon (link «الرئيسية»); desktop search button «ابحث أو انتقل…» with kbd «⌘ K»/«Ctrl K»; on phone a round search icon button «بحث»; NotificationBell at end.
- Main content: max-width 88rem, padding 16px phone / 24 / 32; bottom padding 112px on phone (clears tab bar).
- Footer: «بُعد التمكين · الإصدار الثاني · الخادم يعمل — {version}» (or «الخادم غير متاح»).
- **Phone bottom tab bar** (`MobileTabBar`, hidden ≥lg): fixed bottom, surface/95 + blur, top border, safe-area padding; each item 56px tall, icon 20px over 12px label; active = brand colour + a 3px accent (orange) bar at the top edge of the item; nav aria «التنقل الرئيسي». Items: «اليوم» (LayoutDashboard), «المبيعات» (ShoppingCart), «المشاريع» (Briefcase), «المالية» (Landmark), «المزيد» (Menu). «المزيد» is active for any path belonging to a non-core section.
- **«المزيد» drawer** (MobileDrawer): slides from the right edge, width 86vw (max 384px), title «القائمة», close «إغلاق القائمة»; contains the full Sidebar (account, «إنشاء جديد», all sections with pages, «الأخيرة», settings). Closes on navigation.
- `/more` page (MoreIndex): header «المزيد» / «بقية أقسام المنصة.»; 1–2 column cards (icon + label + hint) for every non-core section; bottom card: user name link → /settings/account and button «خروج».
- **Section tabs strip** (phones/tablets, `SectionTabs`): above list pages of sections with ≥2 visible tabs (home, sales, planning; not finance/settings which have their own): underline tab links, active brand; red count pill from `/api/attention`.
- **FAB**: only on «اليوم» on phone: 56px round brand button with «+» at bottom-left above the tab bar, opens «إنشاء جديد» menu upward.
- **QuickCreate menu items** (perm-filtered): «تسجيل مقبوض» (Wallet, finance.edit) → ReceiptFlow; «فاتورة مشتريات / مصروف» (Receipt, finance.edit) → PurchaseDialog; «فرصة بيع» (ShoppingCart, sales.edit) → NewOpportunityDialog; «عميل» (Users) → ClientDialog; «مشروع» (Briefcase) → ProjectDialog; «مهمة» (ListChecks) → TaskDialog; «اجتماع» (CalendarDays) → MeetingDialog then opens `/meetings?open=id`; «قرار» (Gavel) → DecisionDialog.
- **Command palette** (Ctrl/⌘K or header search): dialog «بحث وانتقال سريع», input placeholder «ابحث عن قسم أو عميل أو مشروع…»; result groups «إنشاء» (commands «تسجيل مقبوض», «فاتورة مشتريات أو مصروف», «فرصة جديدة», «عميل جديد», «مشروع جديد», «مهمة جديدة», «اجتماع جديد», «قرار جديد»), «الأقسام» (incl. «{section} › {tab}»), «العملاء», «المشاريع», «الفرص», «الاجتماعات», «المستندات» (hint «{outgoingNo|number} · {client}»), «المهام» (hint «{project} · {assignee}»). No hits: «لا نتائج لـ «{q}»». Matching ignores diacritics/hamza/ة/ى.
- **NotificationBell** (`/api/notifications`, poll 60s; mark read `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`): bell with badge (aria «التنبيهات، {n} تحتاج انتباهك»). Opens Dialog «التنبيهات»: top section «يحتاج انتباهك» (attention items), Segmented «الكل» / «غير المقروءة ({n})», button «تعليم الكل كمقروء»; grouped list: «المهام», «الاجتماعات والقرارات», «العملاء والمبيعات», «المستندات والاعتمادات», «المشاريع», «المالية», «التخطيط», «أخرى»; per item «تعليم كمقروء». Empty: «قرأت كل شيء ✓» / «لا تنبيهات بعد.»

### 2.3 Attention feed `/api/attention` («ما يحتاج انتباهك»)
Response `{ items: [{key,tone,title,count,link}], checklist: [{key,label,done,link}] }`. Only items with count > 0. Same counts drive nav badges.
| key | tone | title (verbatim) | link |
|---|---|---|---|
| followups | warn | متابعات مبيعات وعملاء حان موعدها | /sales/followups |
| requests | warn | طلبات عروض لم يُتواصل معها منذ أكثر من 3 أيام | /sales |
| quotes-expiring | warn | عروض أسعار تنتهي صلاحيتها خلال 3 أيام | /sales/quotes |
| quotes-waiting | info | عروض أُرسلت ولم يُردّ عليها منذ أسبوع | /sales/quotes |
| docs | info | مستندات بانتظار الاعتماد | /documents?status=review |
| overdue | warn | مشاريع جارية تجاوزت تاريخ انتهائها | /projects?status=active |
| pending | info | حركات مالية معلّقة تنتظر السداد | /finance |
| finance-checks | warn | أرقام مالية تحتاج تدخلك | /finance |
| instalments | warn | دفعات عملاء تجاوزت موعد استحقاقها | /finance?tab=receivables |
| tasks | warn | مهام مسندة إليك تجاوزت موعدها | /tasks?mine=1 |
| meetings | info | اجتماعاتك اليوم | /meetings |
| decisions | warn | قرارات مسندة إليك تجاوزت موعدها | /decisions?mine=1 |
| initiatives | warn | مبادرات في الخطط تجاوزت موعدها | /plans |
| plan-review | info | مراجعة الربع {q} في الخطة لم تُسجَّل بعد | /plans |
- Rendering: warn → amber count badge, info → blue badge.
- Setup checklist items: «أكمل بيانات الجهة والرقم الضريبي» (/settings/org), «أضف أول عميل» (/clients), «أضف أول مشروع» (/projects), «انشر أول خدمة» (/products), «ادعُ زميلاً إلى المنصة» (/settings/team), «ابدأ خطتك التشغيلية» (/plans).

---------------------------------------------------------------------------------------------------

## 3. «اليوم» — Home (`home.tsx`, route `/`)
Purpose: where the day starts. Each card links to its page.

Top → bottom:
1. **Greeting header**: small muted long date (e.g. «الاثنين، 9 نوفمبر 2026»); H1 (24/30px bold) «{صباح الخير|مساء الخير|مساء النور}، {first name}» (before 12 → «صباح الخير», before 18 → «مساء الخير», else «مساء النور»).
2. **YearTargetCard** (compact; only with treasury.view; `/api/finance/year-review?year=`): Card «الإيراد مقابل المستهدف»:
   - «المحقق في {year}» (muted), big amount `sar(revenue)` (24px bold, tabular).
   - With target: «من مستهدف **{target}** · **{pct}%** · المتبقي **{remaining}**». Without: «لا مستهدف لسنة {year}. اضبطه من الإعدادات» (link → /settings/finance).
   - Actions on the end: primary «تسجيل مقبوض» (Wallet icon; needs finance.edit → ReceiptFlow), secondary link «مراجعة السنة» (→ /finance?tab=review i.e. finance overview).
   - 12px progress bar (brand fill) aria «نسبة تحقيق المستهدف». (Non-compact adds footnote «شاملة الضريبة: المقبوضات المسجّلة من العملاء ودخل الشركة، بتاريخ وصولها. هو نفس رقم مؤشر «الإيرادات المحصّلة» في الخطة.»)
3. **ImportHint** (only import.run and zero projects): highlighted card «ابدؤوا بنقل عملائكم من المنصة الحالية» / «اختاروا عميلاً أو أكثر بكامل بياناته ومشاريعه، ثم أضيفوا البقية تدريجياً.» + button «استيراد من المنصة الحالية» (→ /settings/import).
4. **AttentionPanel** (renders nothing if empty): 2-column grid on desktop:
   - Card «ما يحتاج انتباهك اليوم»: rows (44px) title on the start, count Badge on the end; whole row is a link.
   - Card «خطوات إعداد المنصة» (only while fewer than half done): «أنجزت {done} من {n}. تختفي القائمة عند اكتمالها.»; rows with ✓ (green, struck-through) or ○.
5. **Main grid** (desktop 3 cols: 2 main + 1 aside «أرقامك"; phone single column in this order):
   - **«مهامي»** panel (tasks.view; `GET /api/tasks?mine=1`): header icon tile + title + link «كل مهامي» (→ /tasks?mine=1). Groups «متأخرة ({n})» (red), «اليوم ({n})», «القادمة ({n})» (max 5). Row: circular tick button (aria «إنجاز {title}") → `PATCH /api/tasks/{id} {status:"done"}`; title + project name; due date (red if late). Empty: «لا مهام مفتوحة عليك. يوم هادئ!»
   - **«اجتماعاتي»** (meetings.view; `/api/meetings?from=today&to=+6d&mine=1`): link «كل الاجتماعات». «اليوم ({n})» rows: time (w-20 bold) · title · «{location} · {client|request}»; if none today «لا شيء اليوم.»; «بقية الأسبوع ({n})» rows show day (without year) + time in subline. Badges: «عُقد» green; «بعد {n} د» amber if starting within 60 min. Row → /meetings?open=id. Empty: «لا اجتماعات لك هذا الأسبوع.»
   - **«قرارات عليّ تنفيذها»** (`/api/decisions?mine=1&status=open`): link «كل القرارات»; compact DecisionList (max 6). Empty «لا قرارات مفتوحة مسندة إليك.»
   - Aside **«من أتابع اليوم»** (clients.view; `/api/crm/followups?scope=mine`, overdue+today only, max 8): link «كل المتابعات». Row: name/subtitle, subline «عميل» or «فرصة» + « · {value}»; end: calendar icon + «متأخرة» (red bold) or «اليوم» (amber). Link to /clients/{id} or /sales/{id}. Empty «لا متابعات مستحقة عليك اليوم.»
   - Aside **«المبيعات»** (sales.view; `/api/sales/overview`): link «الفرص»; 2×2 Num tiles: «فرص مفتوحة» {count} (hint {value}), «مرجّحة» {weighted}, «مكسوب الربع» {wonThisQuarter}, «نسبة الكسب» {winRate}% or «—».
   - Aside **«المشاريع»** (projects.view; `/api/projects`): link «كل المشاريع»; Num «مشاريع جارية» {counts.active}, «قيمة عقودها» money(sum contractTotal of active, excluding external); then up to 4 active projects (name + client) linking to /projects/{id}.
   - Panel skeleton: pulsing grey block while loading. Quiet empty text: centred muted on canvas-tint rounded box.
- Phone: FAB «+» bottom-left (see 2.2).

---------------------------------------------------------------------------------------------------

## 4. Tasks — «المهام» (`/tasks`, TasksPage)
Data: `GET /api/tasks?mine=1` (scope mine) or `/api/tasks` (all). Task fields: title, description, assigneeId/Name, projectId/Name, stageId, status, priority, startDate, dueDate, doneAt.
Layout:
- PageHeader «المهام»; action (tasks.edit) primary «مهمة جديدة» (+).
- Row (end-aligned): LayoutToggle «قائمة» (List) / «لوحة» (Columns3) / «جدول» (Table2).
- Row of Segmented (scrolls sideways on phone): «النطاق»: «مهامي» | «كل الفريق»; «العرض» (hidden in board layout): «مفتوحة ({n})» | «متأخرة ({n})» | «منجزة ({n})».
- Row: SearchBox «ابحث في المهام» + project select (aria «المشروع») «كل المشاريع» / project names (w-32 on phone).
- Empty states: title «لا مهام تطابق البحث» / «لا مهام بعد» (board) / «لا مهام متأخرة» / «لا مهام منجزة بعد» / «لا مهام مفتوحة»; text «المهام المسندة إليك تظهر هنا.» (mine) or «أضف مهمة وأسندها لأحد الفريق.»
- **List layout**: grid 1 col (2 on lg) of TaskRow cards.
- **TaskRow** card (rounded-xl, p-3): circular checkbox (done = green filled ✓; aria «إنجاز {title}"; toggles done/todo); title (struck & muted when done); meta line: «المسؤول: {name}», project name, «حتى {date}» or «متأخرة · {date}» (red bold), red «عالية» badge; end: status BadgeMenu (change status) + «⋯» menu: «تعديل», «تسجيل وقت», separator, «حذف المهمة» (danger; confirm «حذف المهمة «{title}»؟» action «حذف المهمة»).
- **Board layout**: 4 columns (todo/doing/blocked/done) titled with status label + count pill; columns 17rem wide, scroll horizontally on phone; drag & drop card to change status (`PATCH /api/tasks/{id}`), plus status menu inside each compact card; empty column «لا شيء هنا»; done column shows latest 8 + «وأقدم منها {n} في «منجزة»».
- **Table layout** (desktop only; on phone falls back to TaskRow list): columns «المهمة», «المشروع», «المسؤول», «الأولوية», «الموعد» («متأخرة · {date}»), «الحالة» (BadgeMenu), menu «تعديل».
- **TaskDialog** «مهمة جديدة» / «تعديل المهمة» (POST `/api/tasks`, PATCH `/api/tasks/{id}`; toast «أُضيفت المهمة» / «حُفظت المهمة»; error «تعذّر الحفظ، حاول مرة أخرى.»). Fields: «المهمة» (text, required), «تفاصيل» (textarea), «المسؤول» (select «— غير محدد —» + team from `/api/tasks/assignees`), «الموعد» (date), «الحالة» (4 statuses), «الأولوية» (منخفضة/عادية/عالية), «المرحلة» (only within a project; «— بلا مرحلة —» + stages). Buttons «إضافة المهمة» / «حفظ».
- **TimeDialog** «تسجيل وقت: {title}»: «عدد الساعات» (number), «ملاحظة»; button «تسجيل الوقت»; POST `/api/tasks/{id}/time`.

---------------------------------------------------------------------------------------------------

## 5. Projects

### 5.1 Projects list (`/projects`, ProjectsPage)
Data: `GET /api/projects?q&type&status&product&sort&flag&archived&external` → `{items, counts}`.
- PageHeader «المشاريع» (archived: «المشاريع المؤرشفة»), subtitle «{total} مشروع»; action «مشروع جديد» (+).
- If filtered by product: chip «مشاريع الخدمة: {product}» (or «مشاريع بلا خدمة») + link «إزالة التصفية».
- Row: SearchBox «ابحث باسم المشروع أو رقمه أو اسم العميل»; sort select (aria «الترتيب»): «الأحدث», «الأقرب انتهاءً», «الاسم», «القيمة»; ViewToggle grid/list.
- FilterBar fields: «تحتاج انتباهاً» (all «كل المشاريع»; «متأخرة عن موعد الانتهاء», «عليها دفعة متأخرة»); «المالية» (all «داخلية وخارجية»; «داخلية (تدخل في المالية)», «خارجية (لا تدخل في المالية)»); «النوع» (all «كل الأنواع»; project types). On phone → single «تصفية» button + sheet.
- Status Pills: «الكل {n}», «مسودة», «جاري التنفيذ», «مكتمل», «متوقف», «ملغي» with counts; link-button «عرض المؤرشف» / «عرض المشاريع الحالية».
- States: skeleton «جارٍ تحميل المشاريع»; error «تعذّر تحميل المشاريع» + «إعادة المحاولة»; no match «لا نتائج»…; archived empty «لا توجد مشاريع مؤرشفة»; empty «لا توجد مشاريع بعد» / «أفضل طريقة: افتحوا صفحة العميل ثم «مشروع جديد»، أو أضيفوه من هنا واختاروا العميل.» + «مشروع جديد».
- **Grid** (1/2/3 cols) of **ProjectCard** (whole card links to project; red border if late):
  - Top row: status Badge; «خارجي» gray badge (title «مشروع خارجي: لا يدخل في أي رقم مالي»); stamp «موزّع بالكامل» or «مغلق»; deadline: red «متأخر {n} يوم» (with ⚠), amber «ينتهي خلال {n} يوم» (active, ≤7 days), else muted «ينتهي {date}». End: 🔒 if private (aria «خاص») + project number (ltr).
  - Name (semibold), client avatar(xs) + client name; product «{product} · {package}» in brand colour.
  - Progress: «التنفيذ» {done}/{total} (stages, else tasks) + red «· {n} متأخرة»; bar (brand). «التحصيل» «{received} من {contractTotal}»; bar (green).
  - Footer (top border): «{type} · {startDate}» on start; on end `moneyShort(contractTotal)` + «تقديري» (if estimated; tooltip «تقديري: القيمة المتوقعة + 15% حتى يُسجَّل العقد») or «لا يدخل في المالية» for external.
  - Optional line: calendar icon «الدفعة القادمة: {amount} · {date}» or red «دفعة متأخرة: …».
- **List** view: desktop DataTable (caption «المشاريع»): «المشروع» (name + «{number} · {client}»), «الحالة», «النوع», «الخدمة» (only if any), «الانتهاء», «التنفيذ», «المحصّل», «قيمة العقد» («خارجي»/«تقديري»). Phone: same ProjectCards.

### 5.2 ProjectDialog «مشروع جديد» / «تعديل المشروع»
POST/PATCH via `/api/projects`. Toasts «أُنشئ المشروع» / «حُفظ المشروع». Buttons «حفظ المشروع» / «حفظ التعديلات».
Fields:
- «العميل *» select «اختر العميل…» (required) + inline button «عميل جديد» (opens ClientDialog). Hidden when opened from a client.
- «اسم المشروع *» (required, full width).
- «الخدمة / المنتج» (hint «اختياري: لقياس أداء كل خدمة») «بدون» + products; «الباقة المتعاقد عليها» («بدون باقة محددة» / «اختر الخدمة أولاً»).
- «نوع المشروع» (types), «الحالة الحالية» (statuses), «المدينة / الموقع», «الظهور» («الفريق» / «خاص بي»).
- «تاريخ البداية», «تاريخ الانتهاء المتوقع» (error «تاريخ الانتهاء قبل تاريخ البداية»), «تاريخ استلام الدفعة المالية» (dates).
- «قيمة العقد المتوقعة (ر.س)» (external: «القيمة التقديرية (ر.س)»); hints «قبل الضريبة؛ تصبح قيمة العقد في المالية» / «تُدار الآن من «إعدادات العقد والميزانية»» / «للاطلاع داخل المشروع فقط؛ لا تُجمع في أي رقم»; error «أدخلوا رقماً صحيحاً».
- Checkbox card «مشروع خارجي» — «للمتابعة فقط: لا يدخل في أي رقم مالي، ولا تُسجَّل له قيود أو استلامات. القيمة أعلاه تبقى تقديرية للاطلاع.»
- «ملاحظات» (textarea).
- Errors: «هذا الحقل مطلوب», «العميل مؤرشف. استعيدوه أولاً لإضافة مشروع له.», «للمشروع قيود أو استلامات أو فواتير أو دفعات؛ احذفوها أولاً ليصير خارجياً.»

### 5.3 Project page (`/projects/$id`, ProjectPage)
Data: `GET /api/projects/{id}` (project, service, client, financeExists…), `GET /api/projects/{id}/finance`, `/api/tasks/projects/{id}`, `/api/projects/{id}/documents`, `/api/receivables/projects/{id}`, close-check.
Not found: «المشروع غير موجود» + «العودة إلى المشاريع».

Top → bottom:
1. Breadcrumb «المشاريع / {client}».
2. Notices: amber «هذا المشروع مؤرشف منذ {date}.»; draft (non-external) amber «مسودة: أرقام هذا المشروع لا تُحسب في المالية (الأرباح والضريبة والتحصيل) حتى تتغير حالته إلى «جاري التنفيذ».»
3. **Header**: H1 project name (24/30px) + status **BadgeMenu** (change status; other statuses offered) + stamp «موزّع بالكامل»/«مغلق» + «خارجي» + «🔒 خاص». Under: client link with avatar; meta line: number (ltr) · type · service chip «{product} · {package}» (link «مشاريع هذه الخدمة») · calendar «{start} ← {end|مفتوح}».
   Actions: primary «تسجيل مقبوض» (when finance.edit, not archived, status not draft/cancelled); secondary «إغلاق المشروع» (manager, completed, not closed, not external); secondary «قيد جديد» (finance view); «⋯» menu «إجراءات المشروع»:
   - section «المالية»: «إعادة فتح المشروع» (hint «بسبب يُسجَّل في سجل النشاط») or «إغلاق المشروع» (hint «مراجعة نهائية ثم قفل القيود»); «إعدادات العقد والميزانية» (hint «القيمة، الضريبة، الأتعاب، التصنيفات») / for non-managers «شروط العقد والميزانية» (hint «للاطلاع»); «تسجيل بنود الاتفاقية»; «التقرير المالي للعميل» (hint «كشف المعاملات · PDF»); «التقرير المالي التفصيلي» (hint «الأرباح، تقرير الاتفاقية، الميزانية»); «تصدير المعاملات (Excel)».
   - section «المشروع»: «تعديل بيانات المشروع», «نسخ رابط المشروع», «فريق المشروع», «استعادة المشروع» / «أرشفة المشروع» (hint «يُخفى ويمكن استعادته»), «حذف نهائي» (danger; confirm «حذف «{name}» نهائياً؟» / «لا يمكن التراجع. إن كان للمشروع سجلات فأرشفته أفضل.» / «حذف نهائياً»). Delete blocked: «للمشروع قيود مالية أو مستندات أو مهام، فلا يُحذف نهائياً. أرشِفه بدلاً من ذلك ليبقى سجله.»
4. **StickyProjectBar**: once the header scrolls off, a compact bar slides in under the app header (surface/95, blur, shadow): name (bold, truncated) + status badge; section Segmented; actions (icon-only «تسجيل مقبوض» / «قيد جديد» on phone + «⋯»). On phone the tabs drop to their own row under the name.
5. **ProjectPulse** strip («نبض المشروع»; 2×2 on phone, 4 across on desktop; joined cells):
   - «التنفيذ» (tap → execution): «{done}/{total} مرحلة|مهمة» + bar; empty «لم تُضف مراحل أو مهام».
   - «الموعد»: «متأخر {n} يوم» (red) / «متبقٍ {n} يوم» (amber if ≤7) / «بلا تاريخ انتهاء»; sub «الانتهاء {date}».
   - «المهمة التالية»: title; sub «متأخرة · {date} · {assignee}»; empty «لا مهام بموعد».
   - «الدفعة القادمة»: amount; sub «متأخرة · {label} · {date}»; empty «لا دفعات منتظرة».
6. **FinanceStrip** (non-external): tiles «المصروف من العقد» (sub «منه معلّق {x}» or «{pct} من العقد»), «صافي الربح» («مخفي» if no profit perm), «غير المصنّف من العقد» (sub «▲ تجاوز قيمة العقد» if negative), «هامش الربح»; bar «نسبة الصرف من العقد». Notices: v1 import «مالية هذا المشروع لم تُنقل من المنصة الحالية بعد. الأرقام أعلاه افتراضية وليست أرقامه الحقيقية.» + «استيراد المالية» / «يستطيع مالك المنصة نقلها من صفحة الاستيراد.»; defaults «هذه الأرقام من القيم الافتراضية (ضريبة 15٪، أتعاب تنفيذ 10٪). اضبطوا شروط العقد لتكون دقيقة.» + «إعداد العقد»; missing agreement items «لم تُسجَّل بعد: {items}» + «تسجيلها كلها» («جارٍ التسجيل…») + «مراجعة».
7. **Two-column area** (desktop: main + 20rem sticky aside). **Phone order**: ① «العقد والتحصيل» card, ② work area (Segmented + section), ③ «بيانات المشروع», ④ «الاجتماعات».
   - Section Segmented «أقسام المشروع»: «المالية» (Wallet; hidden for external), «المستندات ({n})» (FileText), «التنفيذ ({done/total})» (ListChecks).
   - **Aside – «العقد والتحصيل»** (ContractCard): heading with FileSignature icon; big gross amount; «شاملة الضريبة» or «+ ضريبة {vat}%»; «حُصّل {received} من {gross}» + {pct}% + green bar; «المتبقي على العميل: {x}» + badge «الدفعة القادمة · {date}» (blue) / «دفعة متأخرة · {date}» (red). «غير مصنّف من العقد» box when contract fully collected but leftover unclassified: «حُصّل العقد كاملاً وبقي هذا المبلغ بلا قيد: صنّفوه أرباحاً أو مصروفاً للمشروع.» + «تحويل إلى أرباح» (confirm «تحويل {x} إلى أرباح؟» / «يُسجَّل قيد إيراد «فائض المشروع» بالمبلغ، فيدخل في ربح المشروع القابل للتوزيع.») + «تحويل إلى مصروف». Inner Segmented «أقسام العقد»: «الملخص» | «الاستلامات ({n})» | «الفواتير ({n})» (VAT perm) | «الدفعات ({pending})» (defaults to الدفعات when an instalment is late).
     - «الملخص» (contract trail): rows «قيمة العقد», «− أتعاب التنفيذ», «− التسويق»/«التسويق (داخلي)», «− كاش باك», «− رسوم إضافية», «= المتاح للتنفيذ», «− المصاريف التشغيلية», «= المتبقي للتنفيذ»; bars «الدخل المسجّل» (green) vs «المصاريف» (red); «الميزانية المخططة ({n} بند)»; link «الإعدادات» / «التفاصيل».
     - «الاستلامات»: list of receipts (date, amount, «غير معتمد» amber or «اعتُمد {date} · {basis}»; negative = «استرجاع »); button «تسجيل مقبوض»; empty «لم يُسجَّل استلام بعد. الربح يُعدّ متحققاً (وقابلاً للتوزيع) بقدر ما يُستلم من قيمة العقد.» Receipt edit dialog «تعديل مقبوض»/«تسجيل مقبوض»: «تاريخ وصوله للبنك» (hint «يحدد ربع السنة الذي يتحقق فيه ربحه»; shows «يقع هذا الاستلام في **{quarter}**»), «المبلغ (ر.س)», checkbox «استرجاع للعميل (يُخصم من المستلم)», «ملاحظة» (placeholder «الدفعة الأولى…»); unapproved notice «هذا المقبوض غير معتمد، فلا يُحتسب في أي رقم. اعتمدوه إن كان دفعة فعلية، أو احذفوه إن كان مكرراً.»; buttons «اعتماد», «حذف», «حفظ»/«تسجيل المقبوض»/«اعتماد المقبوض». Warnings «التاريخ في المستقبل», «التاريخ قبل تاريخ العقد», «قريب من حدّ الربع: تأكدوا من اليوم لأنه يحدد الربع».
     - «الفواتير» (sales tax invoices): intro «الفواتير الضريبية المرسلة للعميل: تاريخها يحدد ربع ضريبة المبيعات. ما لم تُسجَّل فاتورة، تُحتسب ضريبة المشروع بتاريخ كل استلام.»; rows «{date} · {number|بلا رقم}», «منها ضريبة {vat}», «مرفقة»; empty «لا فواتير مسجّلة.»; button «فاتورة ضريبية مرسلة». Dialog «تسجيل فاتورة ضريبية مرسلة»: «رقم الفاتورة», «تاريخ الفاتورة» (hint «يحدد ربع ضريبة المبيعات»), «المبلغ شامل الضريبة (ر.س)», «الضريبة (ر.س)» (hint «فارغ = تُحسب بنسبة المشروع»), «سُدِّدت بالاستلام» (select receipts), file «الفاتورة المرسلة (PDF أو صورة)» «رفع الملف»/«استبدال الملف»/«عرض المرفق».
     - «الدفعات» (ScheduleCard; `/api/receivables/projects/{id}`): rows label, «تستحق {date}» / «متأخرة · {date}» / «استُلمت {date}», amount; per-row Wallet button «تسجيل مقبوض {label}» and delete; button «دفعة»; empty «أضف الدفعات المنتظرة من العميل لتتابعها وتظهر أعمارها.» / «لا دفعات مجدولة.». Dialog «دفعة منتظرة»: «الوصف» (placeholder «مثال: الدفعة الأولى»), «تاريخ الاستحقاق», «المبلغ شامل الضريبة (ر.س)»; button «إضافة»; POST `/api/receivables/projects/{id}`.
     - External projects show instead card «مشروع خارجي»: «لا يدخل في أي رقم مالي: لا قيود ولا استلامات ولا فواتير، ولا يُحسب في الإيرادات أو الضريبة أو الأرباح أو المستهدف.» «القيمة التقديرية (للاطلاع): {x}» «لإدخاله في المالية: «تعديل بيانات المشروع» ثم ألغوا «مشروع خارجي».»
   - **Aside – «بيانات المشروع»** card + ghost «تعديل»: rows «النوع», «الخدمة», «الموقع» (pin icon), «البداية», «الانتهاء المتوقع», «استلام الدفعة», «الظهور» («خاص»/«الفريق») — empty fields omitted; notes box; footer «أُضيف {date} · آخر تعديل {date}».
   - **Aside – «الاجتماعات»** (RecordMeetings): header + button «اجتماع» (pre-linked; title «اجتماع {project}»); rows «{date} · {time}» + «قادم» or meeting status; empty «لا اجتماعات مرتبطة بعد.»
   - **Section «المالية» → «سجل المعاملات»** (Transactions): Pills «الكل» / «دخل» / «مصروف» with counts; SearchBox «بحث في البيان أو التصنيف أو الملاحظة»; grouped by month header «{مارس 2026|بلا تاريخ}  {n} · ±{net}». Phone rows: description + amount; sub «{date} · {category}» + « · اتفاقية» « · فاتورة ضريبية» « · ملغى، لا يُحتسب» « · معلّق». Desktop table: «التاريخ», «البيان», «التصنيف», «الحالة», «المبلغ» (badges «اتفاقية» blue, «فاتورة ضريبية» green, «ملغي · لا يُحتسب»). Footer «{n} عملية · دخل {x} · مصروف {y}». Empty: «لا توجد قيود بعد» / «لا نتائج مطابقة» + «تسجيل بنود الاتفاقية» + «قيد جديد». Tap row → EntryDialog.
   - **Section «المستندات»** (DocumentsSection; `/api/projects/{id}/documents`): Card «العقود والخطابات» + «مستند جديد» (+). Rows: kind icon tile (contract FileSignature / letter Mail), title, «{kind} · {number} · {updated}», outgoing no. (desktop), status badge, «⋯» actions. Tap → document editor. Empty «لا توجد مستندات لهذا المشروع بعد.» + «العقد يُنشأ معبأً تلقائياً من بيانات الجهة والعميل والمشروع والمالية.»
   - **Section «التنفيذ»** (ExecutionTab): «المراحل ({done} من {n})» + button «توليد من آلية عمل الخدمة» (POST `/api/tasks/projects/{id}/stages/from-service`; error «الخدمة المرتبطة بلا خطوات في «آلية العمل».»); stage rows with tap-to-cycle status pill and delete; inline input «مرحلة جديدة» + «إضافة»; empty «لا مراحل بعد» / «ولّدها من آلية عمل الخدمة المرتبطة أو أضف مراحلك.» / «أضف مراحل التنفيذ لتتبّع التقدّم.». Then «المهام · الوقت المسجّل: {hours}» + «مهمة»; TaskRows; empty «لا مهام بعد» / «أضف مهمة وأسندها لأحد الفريق.»
8. Closed footnote: «أُغلق المشروع {date} · {note}. قيوده ومقبوضاته وفواتيره للاطلاع فقط.»

Project dialogs:
- **EntryDialog** «إضافة قيد مالي · {project}» / «تعديل القيد»: Tabs «بند جديد» | «من الاتفاقية». Agreement tab: «سجّلوا كل بنود الاتفاقية غير المسجلة بنقرة واحدة.» + «تسجيل الكل»; table «البند», «المبلغ», «النوع» rows «أتعاب التنفيذ» (دخل), «ضريبة القيمة المضافة» (مصروف), «التسويق», «كاش باك»; per row «✓ مسجّل» or «تسجيل». New tab fields: «التاريخ», «النوع» («مصروف»/«دخل»), «الوصف *», «التصنيف» (built-ins + optgroups «تصنيفات مخصصة», «بنود الميزانية»), for cf «ما هذا البند؟» («لم يُحدد بعد», «ضريبة العقد المحجوزة للهيئة», «رسوم فعلية (منصات، تحويلات…)»), «المبلغ (ر.س) *», «الحالة» (مدفوع/معلق/ملغي), checkbox «يحتوي على ربح» → «هامش الربح» (amount + type «مبلغ ثابت»/%), «احتساب نسبة الضريبة 13.043%», checkbox tax invoice, «ملاحظة». Buttons «إضافة القيد» / «حفظ التعديل», «حذف القيد». Toasts «أُضيف القيد»/«حُفظ القيد».
- **FinanceSettings** Sheet «إعدادات العقد والميزانية» (description «تُحفظ التعديلات تلقائياً» / «للاطلاع فقط»): «العقد والضريبة» (autosave status «جارٍ الحفظ…»/«تعديلات غير محفوظة…»/«حُفظ ✓»): «رقم العقد», «تاريخ العقد», «قيمة العقد (ر.س)» with lock toggle (hint «مثبّتة»), «نسبة الضريبة %», checkbox «شامل الضريبة»; «بنود الاتفاقية» rows (exec/mkt/cashback/cf) with value, type («مبلغ ثابت»/%), basis («من الصافي»/«من الإجمالي»), mkt «داخلي (يُضاف للأرباح)»; «شريط الحساب»: «قيمة العقد الكاملة» − … = «المتاح للتنفيذ»; «تصنيفات المصاريف التشغيلية» («تُحسب في «المتبقي للتنفيذ».», input «تصنيف مخصص جديد» + «إضافة»); «الميزانية المخططة» (+ «بند»; rows «البند»/«المبلغ (ر.س)»; «صُرف {x} من {y}» + « · تجاوز المخطط»; «الإجمالي المخطط»; empty «لا توجد بنود. يمكن تسجيل أي بند لاحقاً كمصروف «من الاتفاقية».»).
- **CloseProjectDialog** «إغلاق المشروع — {name}»: warnings «قبل الإغلاق، راجعوا ({n}):» + «تنبيهات فقط: يمكنكم الإغلاق الآن، أو إصلاحها ثم «تحديث المراجعة».» or blue «لا ملاحظات: المشروع جاهز للإغلاق.»; «الأرقام النهائية» rows «قيمة العقد (شامل الضريبة)», «المستلم المعتمد», «المتبقي على العميل», «المصروفات», «ربح المشروع», «المتحقق منه», «وُزّع سابقاً», «المتبقي للتوزيع» (bold); «ضريبة المشروع»: «ضريبة المبيعات (الفواتير|الاستلامات)», «ضريبة المشتريات القابلة للخصم», «صافي ضريبة المشروع», «المحجوز لها في البنود»; «ملاحظة الإغلاق (اختياري)»; text «بعد الإغلاق لا تُضاف قيود أو مقبوضات أو فواتير للمشروع ولا تُعدَّل، حتى «إعادة الفتح» بسبب يُسجَّل في سجل النشاط.»; buttons «إغلاق المشروع» («جارٍ الإغلاق…»), «تحديث المراجعة». Done step title «أُغلق المشروع»: «أُغلق المشروع وقُفلت قيوده ومقبوضاته وفواتيره.» + «ربحه المتحقق {x}، وُزّع منه {y}، والمتبقي للتوزيع {z}.» + buttons «توزيع ربح المشروع الآن» / «لاحقاً ضمن توزيع الربع».
- **ReopenProjectDialog** «إعادة فتح المشروع»: «سبب إعادة الفتح» (hint «يُسجَّل في سجل النشاط»), button «إعادة الفتح».
- **ProjectMembers** «فريق المشروع»: «من تحدّده هنا يرى هذا المشروع حتى لو كان دوره يقتصر على مشاريعه.»; user checkboxes; «حفظ» (PUT `/api/team/projects/{id}/members`).

---------------------------------------------------------------------------------------------------

## 6. Receipts flow — «تسجيل مقبوض» (ReceiptFlow; from Home, QuickCreate, project page, year review)
- Dialog title «تسجيل مقبوض» or «تسجيل مقبوض — {project}». Footer «تسجيل المقبوض» + «إلغاء».
- Step 1 (if not on a project): «المشروع» select «اختر المشروع…» listing «{project} — {client}» (excludes draft/cancelled/external).
- Step 2 (if the project has pending instalments from `/api/receivables/projects/{id}`): radio cards «من أي دفعة؟»: each «{label}» / «تستحق {date} · {amount}» or red «متأخرة · …»; last option «مبلغ غير مجدول» / «لا يغلق أي دفعة». First pending is preselected.
- Fields: «تاريخ وصوله للبنك» (date, default today; hint «يحدد ربع السنة وفترة الضريبة»); «المبلغ (ر.س، شامل الضريبة)» (number, ltr; prefilled with instalment amount or remaining; hint «الدفعة {x}» / «المتبقي على المشروع {x}»); «ملاحظة» (free amount only; placeholder «الدفعة الأولى…»).
- Live info: brand-soft box «يقع في **{الربع الثاني 2026}**»; amber «استلام جزئي: يبقى {x} دفعةً منتظرة بنفس الموعد.»; warnings «⚠ التاريخ في المستقبل.», «⚠ التاريخ قبل تاريخ العقد.», «⚠ قريب من حدّ الربع؛ تأكد أنه في الربع الصحيح.»
- Validation: «اختر المشروع.», «أدخل التاريخ والمبلغ.», «المبلغ أكبر من الدفعة.»; failure «تعذّر تسجيل المقبوض.»
- Save: instalment → `POST /api/receivables/{id}/receive {date, amount}`; free → `POST /api/projects/{id}/finance/receipts {date, amount, note, basis:"", confirmOver}`. If server says over contract → confirm «المبلغ يتجاوز قيمة العقد» / «استُلم {received} من عقد قيمته {gross}. هل هذه دفعة فعلية وليست مكررة؟» / «تسجيله رغم ذلك».
- Toast «سُجّل المقبوض» or «سُجّل المقبوض، وبقي الباقي دفعةً منتظرة». Refreshes receivables, attention, finance, year-review, projects.
- Single-instalment variant ReceiveDialog «تسجيل مقبوض — {label}»: «تاريخ وصوله للبنك», «المبلغ المستلم (ر.س)» (hint «الدفعة {x}»), same quarter/partial texts.
- **PurchaseDialog** «فاتورة مشتريات أو مصروف» (QuickCreate): «على أي مشروع؟» («اختاروا…», «الشركة (خارج المشاريع)», «{number} · {project}»), «البيان», «النوع» (project: «مواد ومشتريات», «لوجستيات», «تسويق», «رواتب وأجور», «أخرى»; company: «مشتريات عامة», «أصل رأسمالي (أجهزة، أثاث…)», «خدمات وأدوات», «استضافة وبنية تحتية», «تسويق وإعلان», «رواتب وأجور», «أخرى»), «التاريخ», «المبلغ شامل الضريبة (ر.س)», tax-invoice toggle with note «بفاتورة ضريبية تدخل ضريبتها تلقائياً في إقرار ربع تاريخ الفاتورة ضمن «ضريبة المشتريات».»; button «حفظ»; toasts «سُجّلت الفاتورة ودخلت ضريبتها في الإقرار» / «سُجّل المصروف»; errors «اختاروا المشروع أو «الشركة».», «أدخلوا البيان والمبلغ.», «المشروع مغلق: أعيدوا فتحه أولاً.»

---------------------------------------------------------------------------------------------------

## 7. Clients

### 7.1 Clients list (`/clients`, ClientsPage)
Data: `GET /api/clients?…` (hono client) → items with counts. Duplicate check `GET /api/clients/check-duplicate`.
- PageHeader «العملاء» (archived «العملاء المؤرشفون»), subtitle «{n} عميل»; actions «عميل جديد» (+) and (import.run) «استيراد من المنصة الحالية».
- Row: SearchBox «ابحث بالاسم أو الرقم أو المدينة أو البريد»; sort (aria «الترتيب»): «الأحدث», «الاسم», «قيمة العقود», «الأقل تواصلاً»; relationship select (aria «العلاقة») «كل العلاقات» + relationship labels; toggle chips «عملائي» (owner=me) and «تحتاج متابعة» (followup=due); ViewToggle.
- Type Pills: «الكل», «شركة», «جمعية», «جهة حكومية», «فرد», «أخرى» with counts; «عرض المؤرشف» / «عرض العملاء الحاليين».
- States: skeleton «جارٍ تحميل العملاء»; «تعذّر تحميل العملاء»; «لا يوجد عملاء مؤرشفون»; empty «لا يوجد عملاء بعد» / «سجّلوا أول عميل ثم أضيفوا مشاريعه من صفحته، أو انقلوا عملاءكم من المنصة الحالية.»
- **ClientCard** (grid 1/2/3; whole card opens client):
  - Avatar (logo or initial) · name (semibold, hover brand) · line «{code}» + type badge (gray) + relationship badge (toned) · «⋯» menu.
  - Contact chips: 📍 city; «📞 {phone}» (tel:), «واتساب» (wa.me), «بريد» (mailto:).
  - Recent project chips (brand-soft) + «+{n}».
  - Badges «{n} فرصة مفتوحة|فرص مفتوحة» (blue), «{n} دفعة متأخرة|دفعات متأخرة» (red).
  - Footer 3-stat grid: «المشاريع» {n} · «قيمة العقود» moneyShort or «—» · «المستحق عليه» moneyShort (if finance visible) else «المستندات» {n}.
  - CRM line (centred, 12px): «المسؤول: {owner} · آخر تواصل {ago}» / «آخر نشاط {ago}» / «لا تواصل بعد»; red «متابعة {متأخرة|اليوم} · {date}»; tags «#tag #tag».
  - Card menu (ClientActions): «كشف حساب» (hint «طباعة أو تصدير Excel»); section «إجراءات سريعة»: «مشروع جديد لهذا العميل», «إضافة قيد مالي» (hint «لأحد مشاريع العميل» / «أضيفوا مشروعاً أولاً»); «تعديل بيانات العميل», «أرشفة العميل ومشاريعه» (confirm «أرشفة «{name}» ومشاريعه؟» / «يمكن استعادتها لاحقاً.» / «أرشفة»).
- List view (desktop table): «العميل», «الرقم», «النوع», «العلاقة», «آخر تواصل», «المدينة», «المشاريع», «قيمة العقود»; phone shows cards.

### 7.2 ClientDialog «عميل جديد» / «تعديل بيانات العميل»
Buttons «حفظ العميل» / «حفظ التعديلات»; toasts «أُضيف العميل» / «حُفظ العميل».
Fields (2-col on desktop): «اسم العميل *» (full), «نوع العميل» (types), «المدينة», «البريد الإلكتروني» (error «بريد إلكتروني غير صحيح»), «رقم الهاتف», «رقم السجل / الترخيص», «الرقم الضريبي», «العنوان الوطني» (full), «اسم الممثل المفوض», «صفة الممثل», «الموقع الإلكتروني»; logo «شعار العميل» («اختيار ملف»/«تغيير الشعار», «إزالة», hint «PNG أو JPG أو WEBP أو SVG، حتى 200 كيلوبايت»; errors «حجم الشعار أكبر من 200 كيلوبايت», «صيغة الشعار غير مدعومة (PNG أو JPG أو WEBP أو SVG)»); fieldset «جهات اتصال إضافية» (rows «الاسم», «الصفة», «الهاتف», delete «حذف جهة الاتصال»; empty «لا توجد. يمكنكم إضافة منسّق أو مسؤول مالي مثلاً.»; «إضافة جهة اتصال»); «ملاحظات».
Duplicate handling: hard «{الرقم الضريبي|رقم السجل} مسجّل للعميل {name} — مؤرشف. لا يمكن تكرار هذا الرقم.»; soft «يوجد عميل باسم مشابه: {name}» + «نعم، عميل مختلف — تابع الحفظ» / «مراجعة».

### 7.3 Client page (`/clients/$id`, ClientPage)
Data: `GET /api/clients/{id}`, CRM `GET /api/crm/clients/{id}`, statement totals.
- Not found «العميل غير موجود» + «العودة إلى العملاء». Breadcrumb «العملاء / {name}». Archived notice «هذا العميل مؤرشف منذ {date}.»
- **Header card**: large avatar (64px) · H1 name · «{code}» + type badge + city · actions: secondary «تعديل», primary «مشروع جديد», bordered link «كشف حساب» (FileSpreadsheet), «⋯» (adds «إضافة قيد مالي», «استعادة العميل ومشاريعه»/«أرشفة العميل ومشاريعه» (confirm «أرشفة «{name}» و{n} من مشاريعه؟»), «حذف نهائي» (prompt «للحذف النهائي اكتبوا اسم العميل: {name}»; blocked «لا يمكن حذف عميل له مشاريع. استخدموا الأرشفة بدلاً من ذلك.»)).
- **ClientPulse** («نبض العميل», 2×2 / 4 across): «المشاريع» {active} «جارية من {total}» (→ projects tab); «الفرص المفتوحة» (→ crm); «المستحق على العميل» {owed}; «المتابعة» «متأخرة · |اليوم · {date}» or «لا متابعة محددة», sub «آخر تواصل {ago}» / «لا تواصل بعد».
- **Tabs**: «نظرة عامة» | «المشاريع ({n})» | «التواصل والفرص».
  - Overview (2/3 + 1/3): Card «بيانات العميل» (Info grid: «البريد الإلكتروني», «رقم الهاتف», «رقم السجل / الترخيص», «الرقم الضريبي», «العنوان الوطني», «الموقع الإلكتروني», «الممثل المفوض», «تاريخ الإضافة»; «جهات اتصال إضافية»; «ملاحظات»). Card «ملخص المشاريع»: big count, «مشروع · {money} قيمة العقود», per-status badge + count.
  - Projects: list of cards (name, «{number} · {type}», expected value, status badge) → project; empty «لا توجد مشاريع لهذا العميل» + «مشروع جديد».
  - CRM («التواصل والفرص»): (a) «فرص البيع ({n})» + button «فرصة لهذا العميل»; rows «{product|فرصة} · {name}» + stage; empty «لا فرص بعد لهذا العميل.» (b) RecordMeetings («اجتماع مع {client}»). (c) ClientCrm: Card «تسجيل تواصل» — radio chips of contact types (aria «نوع التواصل»), textarea placeholder «ماذا دار؟ وما المتفق عليه؟», «تاريخ التواصل», «المتابعة التالية» (date + quick chips «غداً», «بعد أسبوع», «بعد شهر», «مسح»; hints «بلا تغيير» / «تُمسح المتابعة»), button «حفظ التواصل». «سجل التواصل» timeline (empty «لا تواصل مسجّل بعد» / «سجّل أول اتصال أو اجتماع ليظهر هنا بترتيب زمني.»). Side: «العلاقة» (badge + «تُحسب تلقائياً من المشاريع والفرص والعروض وآخر تواصل.»; «آخر تواصل» {ago|لم يحدث}; «المتابعة التالية» {date · state}); «المسؤول والمصدر»: «المسؤول» select, «المصدر» select, «الوسوم» (hint «اضغط Enter لإضافة وسم»; chips «{tag} ×»).
- Add entry dialog (from menu) «إضافة قيد · {client}»: «المشروع» select «اختاروا المشروع…» → «متابعة» → EntryDialog; «لا توجد مشاريع حالية لهذا العميل.»

### 7.4 Statement «كشف حساب» (`/clients/$id/statement`; `GET /api/clients/{id}/statement`)
- Screen header: «كشف حساب» / «{n} مشروع · بتاريخ {date}»; buttons «تصدير Excel» (Download), «طباعة» (Printer).
- Warnings: «بيانات الجهة ناقصة ({gaps})، فلن تظهر في الكشف.» + «أكملوها من بيانات الجهة»; «بعض المشاريع لم تُسجَّل لها مالية بعد، فتظهر قيمتها المتوقعة ولا مصروفات لها.»
- Printable A4 sheet (letterhead header/footer images): title «كشف حساب عميل»; client block «العميل:», «السجل:», «الرقم الضريبي:», «العنوان:»; org side «رقم العميل:», «التاريخ:», «عدد المشاريع:».
- Table columns: «المشروع» (name + sub «{number} · {contractNo}»), «الحالة», «قيمة العقد (شامل الضريبة)», «الضريبة», «المستلم», «المتبقي على العميل»; totals row «الإجمالي».
- Note «المتبقي على العميل = قيمة العقد شامل الضريبة ناقص ما استُلم منه. صادر من {org}.»; bank line «بيانات التحويل: {org} · {bank} · الآيبان {iban}».
- Excel columns: «رقم المشروع», «المشروع», «الحالة», «رقم العقد», «قيمة العقد قبل الضريبة», «الضريبة», «قيمة العقد شامل الضريبة», «المصروف», «المتبقي من العقد», «المستلم», «المتبقي على العميل», totals «الإجمالي»; sheet «كشف الحساب».
- Error «تعذّر إعداد كشف الحساب» + «إعادة المحاولة».

---------------------------------------------------------------------------------------------------

## 8. Finance — «المالية» (`/finance`, FinancePage; perm treasury.view)
- PageHeader «المالية» / «عقود الجهة وأرباحها ومصروفاتها والتزاماتها، ومالية الشركة والشركاء»; desktop buttons «أرشيف Excel» (FileSpreadsheet) and «التقرير المالي» (FileBarChart2 → /finance/report); on phone these go in the «⋯» moreActions («أرشيف Excel» hint «كل المشاريع والقيود»…).
- Segmented «أقسام المالية» (full width on phone): «نظرة عامة» (Briefcase) | «التحصيل» (Wallet) | «الضريبة» (Percent) | «الأرباح والتوزيع» (PieChart). Selected tab in `?tab=`.
- Archive dialog «أرشيف Excel للمشاريع»: project checklist (finished preselected), «ملف واحد: ورقة ملخص، ثم ورقة لكل مشروع فيها العقد وتقرير الاتفاقية وكل المعاملات.», button «تنزيل ({n} مشروع)» / «جارٍ التجهيز…».

### 8.1 Tab «نظرة عامة»
A. **YearReview** («مراجعة السنة»; `/api/finance/year-review?year=`):
- Year switcher: ‹ «السنة السابقة» · **2026** · «السنة التالية» ›; button «Excel» (export «مراجعة {year}»).
- YearTargetCard (full version with footnote).
- 4 StatTiles: «مقبوضات المشاريع» (hint «منها ضريبة {x}»), «دخل الشركة» («خدمات وإيرادات أخرى»), «محتمل غير مسجّل» («متبقٍّ على مشاريع مكتملة», warn if >0), «قيد التحصيل» («متبقٍّ على مشاريع جارية»).
- Segmented «عرض المشاريع»: «تحتاج مراجعة ({n})», per-flag chips, «الكل ({n})». Flags: «مكتمل وعليه متبقٍّ» («على الأرجح وصل مبلغ لم يُسجَّل استلامه، أو بقي على العميل فعلاً.»), «محصَّل بالكامل ولم يُغلق» («حُصّلت قيمته كاملة؛ أغلقه كمكتمل إن انتهى العمل.»), «دفعة متأخرة» («سطر في جدول الدفعات تجاوز موعده ولم يُستلم.»), «لا استلامات مسجّلة» («له قيمة عقد ولم يُسجَّل عليه أي مبلغ مستلم.»), «بلا بيانات عقد» («القيمة تقديرية من القيمة المتوقعة؛ أدخل رقم العقد وقيمته.»).
- Project cards: name, «{number} · {client}», flag badges, figures «العقد»/«العقد (تقديري)», «المستلم», «المتبقي»; «آخر استلام {date}» / «لا استلامات» + « · في {year}: {x}»; actions «تسجيل مقبوض» (→ ReceiptFlow with project), «إغلاق كمكتمل» (confirm «إغلاق «{name}» كمكتمل؟» / «يُنقل إلى المشاريع المكتملة، ويمكن إعادة فتحه لاحقاً.» / «إغلاق كمكتمل»). Empty «كل مشاريع السنة مرتّبة ✓» / «لا مشروع يحتاج مراجعة لرقم الإيراد.»
B. **«ربحية المشاريع»** (H2) (`/api/finance/overview?from&to&client&status`):
- FilterBar with leading PeriodPicker (select «كل الفترات», «ربع سنة», «سنة كاملة», «فترة مخصصة»; year select; quarter segmented «ر1..ر4»; custom «من» … «إلى»), fields «العميل» («كل العملاء»), «الحالة» («كل الحالات»).
- Quality card «بيانات ناقصة تؤثر على دقة الأرقام»: «{n} مشروع لم يُسجَّل له أي مبلغ مستلم (لا يُعرف ربعه ولا يدخل في التوزيع)» · «{n} قيد بلا حالة (مدفوع/معلّق)»; toggle «إكمال الآن»/«إخفاء»; inline fixes «راجعوا مقترح الاستلام واعتمدوه», «اعتبار {n} قيد مدفوعة».
- FinanceChecks banner: «تحتاج تدخلك: {n} ملاحظة|ملاحظات على الأرقام» with links to fix points.
- 6 tiles (1/2/3 cols) with deltas vs previous period: «قيمة العقود (شامل الضريبة)» (sub «{n} مشروع · ضريبة {x} · {n} بلا مالية»), «صافي الربح» (sub «هامش {pct}», good), «المستلم من العملاء» («بتاريخ وصوله للبنك»), «المصروفات» (lower is better), «المتبقي من العقود» (bad if <0), «التزامات قائمة» (sub «{n} بند», warn).
- Charts: «الحركة الشهرية» (monthly bars income/expense, series colours), «المصروفات حسب التصنيف».
- «ربحية المشاريع» DataTable («رتّب بالنقر على رأس العمود»): «المشروع» (+ «{number} · {client} · {status}» + « · بلا مالية»), «قيمة العقد», «المصروف», «صافي الربح», «الهامش», «المتبقي».
- «العملاء حسب قيمة العقود» (bar list).
- «الالتزامات والمستحقات» — «قيود معلّقة لم تُدفع، وبنود في الاتفاقية لم تُسجَّل في مالية مشروعها بعد.»; rows «{item} غير مسجّل · {project}» and amber «معلّق» «{description} · {project}»; empty «لا التزامات قائمة ✓».
- Empty period: «لا مشاريع في هذه الفترة» / «يدخل المشروع الفترة بتاريخ أول مبلغ استُلم منه (أو تاريخ عقده أو بدايته). جرّبوا «كل الفترات».»; error «تعذّر تحميل المالية».

### 8.2 Tab «التحصيل» (receivables; `/api/receivables?opening=`)
1. **ReceiptProposals** card «مقترحات الاستلام للاعتماد»: «موعد الاستلام هو ما يحدد الربع. راجعوا التاريخ والمبلغ لكل مشروع ثم اعتمدوه؛ لا يُحتسب شيء قبل اعتمادكم. المبلغ المقترح هو كامل قيمة العقد، فعدّلوه إن كان الاستلام جزئياً.»; rows «{project}» / «{client} · قيمة العقد {gross}» / «المقترح: **{date}**» + warnings («تاريخ في المستقبل», «قبل تاريخ العقد», «قريب من حدّ الربع») or «لا تاريخ في بياناتها لاقتراحه، أدخلوا موعد الاستلام يدوياً.»; button «مراجعة واعتماد» / «سجّل استلاماً». Empty ✓ «لا مقترحات: كل المشاريع لها استلامات معتمدة.»
2. **«أعمار الديون»**: line «المستحق على العملاء: **{total}** · المتأخر: **{overdue}**» (red); 5 bucket cards (2 cols phone / 5 desktop): label, amount (red for 90+), «{n} دفعة».
3. **«الدفعات المنتظرة»**: rows «{label} · {project}», client, «متأخرة · {date}» (red) / «تستحق {date}», amount; buttons «تسجيل مقبوض» (→ ReceiveDialog) and «تذكير واتساب» (opens wa.me with text «السلام عليكم {client}،\nنذكّركم بدفعة «{label}» لمشروع «{project}» بمبلغ {amount}، وتاريخ استحقاقها {due}.\nنشكر لكم تعاونكم.\n{org}»). Empty «لا دفعات منتظرة» / «أضف جدول دفعات من صفحة المشروع لتظهر هنا وتُحسب أعمارها.»
4. **«التوقّع النقدي لـ13 أسبوعاً»**: «الداخل: الدفعات المجدولة (المتأخرة تُحتسب في الأسبوع الأول). الخارج: مصروفات المشاريع المسجّلة وغير المسدّدة ({x}).»; Field «الرصيد الحالي (ر.س)» (hints «يضبطه من يملك تعديل المالية» / «يُحفظ على هذا الجهاز» / «محفوظ للجميع · {date}» / «يُحفظ للجميع عند الخروج من الحقل»); local-balance notice «على هذا الجهاز رصيد محفوظ سابقاً ({x}) لا يراه غيرك.» + «اعتماده رصيداً للجميع» (toast «حُفظ الرصيد الافتتاحي للجميع»); shortfall warning «يتوقع أن ينخفض الرصيد عن الصفر في الأسبوع الذي يبدأ {date}.»; bar chart «الرصيد المتوقع في نهاية كل أسبوع» + caption «الرصيد المتوقع في نهاية كل أسبوع، بالريال. التاريخ تحت كل عمود هو آخر يوم في الأسبوع.»; disclosure «عرض الجدول» → table «الأسبوع», «داخل», «خارج», «الرصيد».

### 8.3 Tab «الضريبة» (VatTab; `/api/finance/vat/report?year&q`, `/api/finance/vat/year?year`, `/api/finance/vat/settings`)
- Bar: year select; Segmented «الفترة» «السنة» «ر1»…«ر4»; buttons «مشترى للشركة» (+), link «إعدادات الضريبة» (→ /settings/finance), primary «تقرير الربع» (only with a quarter → /finance/vat/report).
- **Year returns** «إقرارات سنة {year}» — «يُقدَّم كل إقرار ويُسدَّد قبل نهاية الشهر التالي للربع. السداد للهيئة تسوية لا مصروف.»; summary «صافي السنة {x} · سُدِّد {y} · المتبقي|رصيد دائن {z}». Phone: one card per quarter («ر{q}», ⚠ «فيه تنبيهات», «المخرجات {x} · المدخلات {y}», «الصافي {z}», «الموعد {date}», status badge, button «تسجيل»/«تعديل»); desktop table «الربع», «المخرجات», «المدخلات», «الصافي», «الموعد», «الحالة», action. Tap quarter selects it.
- Filing dialog «إقرار {quarter}»: «الصافي حسب المنصة الآن: {x} · موعد التقديم {date}»; «الحالة» («مفتوح», «قُدِّم ولم يُسدَّد», «سُدِّد»), «تاريخ التقديم», «تاريخ السداد», «المبلغ المسدَّد (ر.س)», «رقم المرجع (سداد)»; «حفظ» → toast «حُفظ الإقرار».
- Period detail: caption «{period} · المبيعات بتاريخ الفاتورة الضريبية المرسلة للعميل (أو تاريخ الاستلام إن لم تُسجَّل فاتورة)، والمشتريات بتاريخ فاتورتها · النسبة الحالية {rate}%»; amber warning list (e.g. «الرقم الضريبي للجهة غير مسجّل في «الإعدادات ← بيانات الجهة».», «{n} مشروع له قيمة عقد ولا استلام معتمداً ولا فاتورة: ضريبة مبيعاته لا تظهر بعد.», «{n} فاتورة مشتريات ناقصة البيانات (المورد/رقمه الضريبي/رقم الفاتورة/تاريخها).», «{n} مصروف بلا فاتورة ضريبية: إن كان له فاتورة سجّلوها لتُخصم ضريبتها.», «{n} مشروع فواتيره المسجّلة أقل مما استُلم منه: قد تنقصه فاتورة.», «{n} بند «رسوم إضافية» لم يُحدَّد: هل هو ضريبة العقد المحجوزة للهيئة أم رسوم فعلية؟», «{n} قيد سداد ضريبة مسجّل كمصروف مشروع: انقلوه إلى سداد الربع (القائمة أدناه).»).
- 3 tiles: «ضريبة المبيعات (المخرجات)» (sub «على مبيعات {x} قبل الضريبة»), «ضريبة المشتريات القابلة للخصم» (sub «على مشتريات {x} قبل الضريبة»), «صافي المستحق للهيئة» / «صافي المسترد من الهيئة» (warn/good; sub «محجوز في المشاريع لها: {x}»).
- Sections: «سداد ضريبة مسجّل كمصروف مشروع ({n})» (explain + select «الإقرار» + «نقل»; confirm «نقل {x} إلى سداد إقرار {key}؟»); «المبيعات» (table «التاريخ», «المشروع», «المستلم», «قبل الضريبة», «الضريبة»; badges «فاتورة {no}» / amber «استلام بلا فاتورة»; total «الإجمالي»; empty «لا مبيعات في هذه الفترة.»); «المشتريات بفواتير ضريبية» («تاريخ الفاتورة», «البيان / المورد», «المشروع», «قبل الضريبة», «الضريبة»; amber «ناقص: …»; empty «لا مشتريات بفواتير ضريبية في هذه الفترة.»); «مصروفات لم تُحدَّد بعد ({n})» with per-row «له فاتورة ضريبية».
- Company purchase dialog «مشترى للشركة بفاتورة ضريبية»: «مشتريات الشركة خارج المشاريع: أجهزة، أثاث، اشتراكات… تُخصم ضريبتها في إقرار ربع الفاتورة، وتظهر في «إيرادات الشركة ومصروفاتها».»; «البيان», «النوع», «تاريخ الفاتورة», «المبلغ شامل الضريبة (ر.س)», «الضريبة (ر.س)» (hint «فارغ = تُحسب بالنسبة الحالية»), «المورد», «الرقم الضريبي للمورد», «رقم الفاتورة»; toast «سُجّل المشترى بفاتورته».
- `/finance/vat/report` = printable quarter return (lighter).

### 8.4 Tab «الأرباح والتوزيع» (profit)
- Period bar «فترة الأرباح»: year select + Segmented «السنة كاملة» «ر1»…«ر4».
- **QuarterCentre**: «الأرباع» card («اختاروا ربعاً لترى مشاريعه وتوزّعه.»; rows per quarter «استُلم {x} · متحقق {y} · صافي الشركة {z}» + stamp «موزّع»/«موزّع جزئياً · بقي {x}»/«لم يُوزَّع»). Period tiles: «المستلم في {label}», «الربح المتحقق في الربع|السنة», «صافي مالية الشركة في الربع|السنة» (sub «إيرادات {x} · مصروفات {y}»), «القابل للتوزيع (المحدد)» (sub «منه خصم تجاوزات سابقة {x}»). Primary «توزيع {label}» (PieChart) or note «أضيفوا الشركاء وحصصهم أولاً من تبويب «الشركاء والتوزيع».». Leftover notice. «المشاريع وأرباحها المتحققة» («يتحقق ربح المشروع بقدر ما استُلم من قيمة عقده حتى نهاية الربع…»): checkbox rows «تضمين {name}», «{client} · استُلم {x} من {gross}», stamps «موزّع بالكامل» / «مغلق · جاهز للتوزيع», amber «غير مصنّف {x}», flags («لا استلامات مسجلة», «وُزّع أكثر من ربحه الحالي بـ {x}», «ربح تقديري: بنود اتفاقية غير مسجلة», «مصروفات معلّقة», «مشروع ملغى», «مسودة/متوقف»); phone dl «متحقق في الربع», «وُزّع سابقاً», «المتبقي للتوزيع»; desktop table «المشروع», «المستلم في الربع», «متحقق في الربع», «متحقق حتى نهايته», «وُزّع سابقاً», «المتبقي للتوزيع». Box «قبل التوزيع» (5 bullet rules) + «المحتجز حتى الآن: {x}».
- **«إيرادات الشركة ومصروفاتها»** (CompanyTab; `/api/finance/company…`): «ما يدخل الشركة ويخرج منها خارج المشاريع في الفترة؛ صافيه يدخل في الربح القابل للتوزيع.»; tiles «أرباح المشاريع» («المشاريع الجارية والمكتملة»), «إيرادات الخدمات» («بتاريخ وصولها للبنك»), «مصروفات الشركة», «صافي ربح الشركة» («في الفترة المختارة»), «المتاح للتوزيع» («كل الفترات − ما وُزّع ({x})»), «الحد الأدنى في البنك» («ما تحتاجه المشاريع الجارية للتنفيذ»); charts «إيرادات ومصروفات الشركة شهرياً», «المحتجز من التوزيعات»; ledger «سجل إيرادات ومصروفات الشركة» (buttons «إيراد», «مصروف», «المحذوفات»/«العودة للسجل»; Pills «الكل»/«إيرادات»/«مصروفات»; columns «التاريخ», «البيان», «التصنيف», «المبلغ»; «وصل البنك {date}»; restore «استعادة»; empty «لا قيود بعد. سجّلوا إيرادات الخدمات ومصروفات الشركة العامة هنا.»). Dialog «إضافة|تعديل إيراد|مصروف للشركة»: «البيان», «المبلغ (ر.س)», «التصنيف», «التاريخ», «تاريخ وصوله للبنك» (income; hint «يحدد ربع السنة الذي يُحسب فيه»), «ملاحظة». Card «مشاريع لا تدخل في أرباح الشركة».
- **«الشركاء والتوزيعات»** (PartnersTab): header «توزيعات الأرباح» + buttons «توزيع سابق», «توزيع ربح مشروع». Card «أرصدة الأرباح» (explanation; tiles «ربح متحقق من المشاريع» «بالاستلامات المعتمدة», «صافي الشركة» «إيراداتها − مصروفاتها خارج المشاريع», «وُزّع واحتُجز» «للشركاء {x} · محتجز {y}», «أرباح غير موزّعة» «جاهزة للتوزيع أو الاحتجاز»; «المحتجز: احتياطي {x} · تشغيل {y} · تطوير {z}.»; «معتمد ولم يُدفع للشركاء بعد: {x}»). Card «الشركاء» (+ «شريك»; rows name + share %; «مجموع الحصص: {x}% ✓» / «— يجب أن يكون 100%»; empty «لا شركاء بعد. أضيفوا الشركاء وحصصهم.»; dialog «إضافة شريك»/«تعديل شريك»: «الاسم», «الحصة %», «ملاحظة»). Distribution list rows: «{period|توزيع}», «دُفع {date}» / «اعتُمد {date}» / «مسودة · {date}», «وُزّع {x} · محتجز {y} ({category})», badge «مدفوع»/«معتمد»/«مسودة»; empty «لا توزيعات في هذه الفترة.» / «لم يُسجَّل أي توزيع بعد.». Distribution detail: «اعتماد» (confirm «اعتماد التوزيع؟» / «بعد الاعتماد لا يمكن تعديله أو حذفه، ويُخصم من المتاح.»), «حذف المسودة», record payment «تاريخ الدفع للشركاء», «مرجع التحويل (اختياري)», «تسجيل الدفع». Wizard «توزيع أرباح · الخطوة {n} من 2» («التالي», «السابق», «اعتماد التوزيع», «حفظ كمسودة»). «تسجيل توزيع سابق» dialog («من»: «أرباح ربع»/«أرباح مشروع», «السنة», «الربع», «المشروع», «المبلغ المدفوع فعلاً (ر.س)», «تاريخ الدفع», «مرجع التحويل (اختياري)»; button «تسجيل»).

---------------------------------------------------------------------------------------------------

## 9. Sales — «المبيعات»

### 9.1 Opportunities / pipeline (`/sales`, OpportunitiesPage)
Data: `GET /api/product-requests` (opportunities = product requests), team people, `PATCH /api/product-requests/{id}`.
- PageHeader «الفرص» / «من أول تواصل حتى التعاقد: جديد ← مؤهَّل ← عرض سعر ← تفاوض ← مكسوب»; actions: link buttons «عروض الأسعار» (FileText → /sales/quotes), «التحليلات» (BarChart3 → /sales/analytics), primary «فرصة» (+, sales.edit).
- KPI strip «ملخص الفرص» (joined cells; 2 cols phone / 5 desktop): «مفتوحة» {count} (hint total value), «القيمة المرجّحة» (hint «بحسب المرحلة»), «مكسوب هذا الربع» (green), «نسبة الكسب» {rate}% (hint «{won} مكسوب · {lost} خاسر»), and a tappable cell (full width on phone) «تحتاج متابعة اليوم» {n} (amber when >0) «اضغط للتصفية» / «اضغط لعرض الكل» (toggles state=follow).
- Row: SearchBox «ابحث باسم العميل أو الجهة أو الخدمة» + LayoutToggle «كانبان» (Columns3) / «قائمة» (List) / «جدول» (Table2).
- FilterBar: «المسؤول» («كل المسؤولين», «بلا مسؤول», people), «المصدر» («كل المصادر», «من الموقع», «سُجّلت يدوياً»), «الخدمة» («كل الخدمات»), «الحالة» («كل الفرص», «تحتاج متابعة», «راكدة (أسبوع بلا حركة)», «المفتوحة فقط», «المغلقة فقط»).
- Empty: «لا فرص بعد» / «تصلك هنا طلبات «اطلب عرضاً» من الموقع، وتسجّل أي فرصة وصلتك بوسيلة أخرى.» + «فرصة جديدة»; no match «لا فرص تطابق هذا البحث» / «غيّر التصفية أو امسح البحث.»
- **Kanban** (desktop ≥lg): 6 columns (new→lost) with header «{stage}» + count + «· مرجّحة {x}»; drag LeadCards between columns; empty column «لا شيء هنا». **Phone**: Segmented «مراحل المسار» with «{stage} ({n})» chips (scrolls), then the selected stage's cards (1/2 cols).
- **List**: grouped sections per stage: heading «{stage} {count} {sum}» then card grid.
- **Table** (desktop): «الفرصة», «المرحلة» (badge), «القيمة», «المسؤول», «المتابعة», «في المرحلة» («{n} يوم»), «المصدر» («الموقع»/«يدوي»); product «خدمة غير محددة» when empty.
- **LeadCard**: title link «{entity|name}» → /sales/{id}; sub «{contact name} · {product}»; badges «راكدة» (amber), value (blue); meta «وصل {ago}», «{n} يوم في المرحلة», «المسؤول: {name}», calendar «متابعة {date}» / «متأخرة · {date}» (red), «السبب: {lostReason}»; bottom (edit): stage BadgeMenu, secondary «متابعة» (CalendarClock) → FollowUpDialog, «⋯» «عرض سعر», «واتساب».
- **FollowUpDialog** «متابعة {name}»: «المسؤول» («— غير محدد —»), «موعد المتابعة» (date), «القيمة المتوقعة (ر.س)», (lost only) «سبب عدم الإتمام», «ملاحظات»; «حفظ».
- **NewOpportunityDialog** «فرصة جديدة» (button «إنشاء الفرصة», toast «أُنشئت الفرصة»): Segmented «نوع العميل» «عميل قائم» | «عميل جديد»; existing → «العميل» select «— اختر العميل —»; new → «اسم الجهة أو العميل» (placeholder «مثلاً: جمعية البر»), «الجوال», «البريد الإلكتروني», note «يُنشأ العميل بهذه البيانات ويظهر في «العملاء» كمحتمل.»; similar-name warning «يوجد عميل باسم مشابه: {name} ({code}).» + «استخدم هذا العميل» / «أنشئ عميلاً جديداً رغم ذلك»; «جهة الاتصال (اختياري)» (placeholder «من نتحدث معه»), «الخدمة» («— لم تُحدد —»), «الباقة», «القيمة المتوقعة (ر.س)», «المسؤول» («— أنا لاحقاً —»), «أول متابعة» (date), «ما الذي يحتاجونه؟» (textarea). Errors «هذا العميل مؤرشف: استعده أولاً.», «اكتب اسم الجهة أو العميل.», «تعذّر الحفظ، راجع البيانات.»

### 9.2 Opportunity page (`/sales/$id`, `GET /api/product-requests/{id}`)
- Not found «الفرصة غير موجودة» + «العودة إلى الفرص». Breadcrumb «الفرص / {client}».
- Header: H1 «{entity|name}» + stage badge (won green, lost gray, else blue) + source badge «من الموقع»/«سُجّلت يدوياً»; sub: client link (avatar) or «بلا عميل بعد — يُنشأ عند أول تواصل», «جهة الاتصال: {name}», product chip «{product} · {package}». Actions: secondary «سجّل تواصلاً» (NotebookPen), primary «عرض سعر» (open only), «⋯» «إجراءات الفرصة»: section «الفرصة»: «المسؤول والقيمة والمتابعة», «تسعير من الخدمة» (hint «من نموذج تكاليف الباقة»), «اكسب وحوّل إلى مشروع», «أغلقها كخاسرة».
- **Stepper** «مراحل الفرصة»: steps جديد→مؤهَّل→عرض سعر→تفاوض→مكسوب (done ticked, current marked), «خاسر» set apart; tappable to move stage (when editable).
- Notices: «سبب الخسارة: {reason}» (amber); «تحوّلت هذه الفرصة إلى مشروع. فتح المشروع» (blue).
- Facts strip «أرقام الفرصة» (2×2 phone, 4 desktop): «القيمة المتوقعة», «القيمة المرجّحة» (hint «بحسب احتمال المرحلة»), «عمر الفرصة» «{n} يوم» (hint «منذ {date}»), «في هذه المرحلة» «{n} يوم» (warn ≥14).
- Main (Segmented «أقسام الفرصة»: «النشاط» | «عروض الأسعار ({n})» | «التفاصيل»):
  - النشاط: «سجّل تواصلاً» form (radio chips type; textarea «ماذا قيل؟ ما الخطوة التالية؟»; «المتابعة التالية:» chips «كما هي», «غداً», «بعد 3 أيام», «بعد أسبوع»; note «أول تواصل ينقل الفرصة إلى «مؤهَّل» ويربطها بعميلها.»; «حفظ التواصل») behind button «إضافة ملاحظة أو تواصل»; Timeline (type label · when · text; stage changes muted «تغيّر المرحلة»; delete «حذف التواصل»); empty «لا نشاط بعد» / «سجّل أول اتصال أو رسالة: تظهر هنا مع تغيّر المراحل بترتيب زمني.»
  - عروض الأسعار: «عرض سعر جديد»; rows number, status badge, «منتهٍ» red, total, «صالح حتى {date}» / «بلا تاريخ صلاحية», buttons «تحويل إلى مشروع» (accepted), «طباعة»; empty «لا عروض لهذه الفرصة» / «أنشئ عرضاً من بنود حرة أو من باقة، ثم أرسله ملف PDF.»
  - التفاصيل: «ما طلبوه» (message or «لا رسالة.» + intake answers); «التسعير من الخدمة» («{package} × {times}: السعر {x} قبل الضريبة · الإجمالي {y}», «الربح {x} ({pct}%). أرقام داخلية لا تظهر للعميل.»); «ملاحظات داخلية» textarea.
- Aside (sticky desktop): «التواصل» (phone/email chips, «واتساب», «بريد»; «لا وسيلة تواصل مسجّلة.»); «المتابعة التالية» (date or «لم تُحدد»; chips «غداً», «بعد 3 أيام», «بعد أسبوع», «مسح»); «بيانات الفرصة» + «تعديل»: «المسؤول» (inline select), «الخدمة», «المصدر» («طلب من الموقع»/«سُجّلت يدوياً»), «آخر حركة» {ago}; «الاجتماعات» (RecordMeetings, «اجتماع مع {name}»).
- Win dialog «كسب الفرصة»: «مبروك! الخطوة التالية عادةً مشروع يبدأ منه التنفيذ والتحصيل.»; buttons «تحويل العرض المقبول {number} إلى مشروع» / «تحويل إلى مشروع» / «تعليمها كمكسوبة فقط».
- Lost dialog «إغلاق الفرصة كخاسرة»: «السبب يساعدك على فهم ما يفوتك من فرص.»; quick reasons «السعر», «اختاروا جهة أخرى», «أُجّل المشروع», «لا ميزانية», «لا رد»; «السبب» field; button «إغلاق كخاسرة».

### 9.3 Quotes «عروض الأسعار» (`/sales/quotes`; `GET /api/quotes`)
- SalesCrumb (breadcrumb «الفرص» back) + title «عروض الأسعار» / «كل العروض بحالاتها، ونسخها وتحويل المقبول إلى مشروع».
- Stats: «أُرسلت» (hint «{n} مقبول · {n} مرفوض»), «نسبة القبول» («من العروض التي حُسمت»), «متوسط قيمة العرض», «قيمة المقبول».
- Pills: «الكل», «مسودة», «أُرسل», «مقبول», «مرفوض», «تنتهي قريباً», «تنتظر رداً» (counts) + primary «عرض سعر جديد».
- Rows: number + title, badges status / «تنتهي قريباً» / «بلا رد» (amber) / «منتهٍ» (red), «{recipient} · {entity}», total; buttons «نسخ» (POST `/api/quotes/{id}/duplicate`), «تحويل إلى مشروع» (accepted, not converted), «فتح المشروع», «طباعة» (→ /print/quotes/{id}). Empty «لا عروض أسعار بعد» / «أنشئ عرضاً من أي فرصة أو من هنا، ثم أرسله كملف PDF.» or «لا عروض في هذا العرض».
- **QuoteDialog** «عرض سعر جديد» / «عرض سعر {number}» (wide): status badge, «منتهي الصلاحية», link «طباعة / PDF»; «عنوان العرض», «موجّه إلى», «الجهة»; fieldset «البنود»: rows «البند», «الكمية», «السعر», delete; «بند» (+) and select «إضافة من باقة…» (catalog `/api/quotes/catalog`); «خصم (ر.س)», «ضريبة القيمة المضافة %» (default `/api/quotes/vat-rate`), «صالح حتى» (date), «الشروط والملاحظات»; totals box «المجموع», «الخصم», «الضريبة ({vat}%)», «الإجمالي». Footer: «حذف المسودة», «حفظ», «حفظ وإرسال», (sent) «تم القبول», «رُفض». Errors «أضف بنداً واحداً على الأقل قبل الإرسال.», «انتهت صلاحية العرض. عدّل تاريخ الصلاحية أولاً.», «العرض المقبول نهائي ولا يُعدَّل.», «عُدّل العرض من مكان آخر. أعد فتحه.». Accepted note «العرض مقبول. حوّله إلى مشروع من قائمة العروض.» / «العرض مقبول وتحوّل إلى مشروع. فتح المشروع».
- **ConvertQuoteDialog** «تحويل إلى مشروع»: «يُنشأ العميل إن لم يكن موجوداً ومشروع بمسوّدة بقيمة العرض {number}، ويُغلق الطلب المرتبط كمكسوب.»; «اسم المشروع»; radio «جدول الدفعات»: «دفعة واحدة بعد 30 يوماً», «50% عند البدء و50% بعد 60 يوماً», «40% عند البدء و30% بعد 30 يوماً و30% بعد 60 يوماً», «بلا جدول دفعات»; success «أُنشئ المشروع وجدول دفعات من {n} دفعة. تجد الدفعات في المالية ← التحصيل.» + «فتح المشروع».

### 9.4 Follow-ups «المتابعات» (`/sales/followups`; `GET /api/crm/followups?scope=mine|all`)
- SalesCrumb «المتابعات» / «من ينتظر ردّنا: عملاء وفرصاً، المتأخر منها أولاً»; Segmented «النطاق» «متابعاتي» | «كل الفريق».
- Groups: «متأخرة», «اليوم», «هذا الأسبوع», «لاحقاً». Row: title, kind «عميل»/«فرصة», «{state} · {date} · المسؤول: {owner}»; actions «سجّل تواصلاً», snooze «غداً», «بعد أسبوع», «تمّت», WhatsApp icon.
- Dialog «تواصل مع {title}»: «النوع», «ماذا دار؟», «المتابعة التالية» (hint «اتركه فارغاً إن لم تلزم متابعة أخرى»), «حفظ».
- Empty «لا متابعات مجدولة» / «حين تسجّل تواصلاً مع عميل وتحدد موعد المتابعة التالية تظهر هنا في وقتها.»

### 9.5 Sales analytics «تحليلات المبيعات» (`/sales/analytics`; `/api/sales/overview?from&to`) — lighter
- Subtitle «القمع والتحويل والمكسوب والعروض والمصادر»; period picker + note «الفترة تخص النتائج (المكسوب والخاسر والمصادر)؛ الفرص المفتوحة كما هي اليوم.»
- Tiles «فرص مفتوحة» («{x} إجمالاً»), «القيمة المرجّحة» («القيمة × احتمال كل مرحلة»), «المكسوب هذا الربع», «نسبة التحويل» («{won} فازت · {lost} خسرت · {n} يوماً للإغلاق»).
- Panels: «قمع الفرص» (+ «فتح الفرص»; stage bars «{count} · {value}»), «ما يحتاج تصرفاً اليوم» («متابعات حان موعدها», «فرص راكدة (بلا نشاط أكثر من أسبوع)», «عروض تنتهي خلال 7 أيام», «عروض مرسلة بلا رد منذ أكثر من أسبوع», «الأكثر ركوداً» «{n} يوماً»), «عروض الأسعار» («أُرسلت», «نسبة القبول», «متوسط القيمة», «ينتهي {date}»), «التحويل حسب المصدر» (table «المصدر», «الفرص», «فازت», «التحويل»), «المكسوب شهرياً (آخر 12 شهراً)» (chart; empty «لا مكاسب مسجّلة في آخر 12 شهراً.»), «أهم العملاء قيمةً» (+ «كل العملاء»). Empty board «لوحتك فارغة لأنها لا تزال في البداية».

---------------------------------------------------------------------------------------------------

## 10. Documents — «المستندات»

### 10.1 Register (`/documents`; `GET /api/documents?…` + quotes)
- PageHeader «المستندات» / «{n} مستند · {d} مسودة · {o} في سجل الصادر»; primary «مستند» (+).
- Segmented «السجل»: «كل المستندات» (Inbox) | «سجل الصادر» (Stamp); LayoutToggle «قائمة» | «جدول».
- SearchBox «ابحث بالعنوان أو الرقم أو رقم الصادر أو المشروع أو العميل».
- FilterBar: «الحالة» («كل الحالات»; «مسودة», «قيد المراجعة», «معتمد», «صادر برقم», «عرض أُرسل», «عرض مقبول», «عرض مرفوض»), «العميل» («كل العملاء»), «الفترة» («كل الأوقات»; «آخر 30 يوماً», «آخر 3 أشهر», «هذه السنة»).
- Kind Pills: «الكل», «العقود», «الخطابات», «عروض الأسعار» (if sales) with counts.
- Busy notice «جارٍ {action}…».
- **List** (cards grid 1/2/3): kind icon tile (quote = green tile), title, «{kind} · {client} · {project}», meta «{outgoingNo (brand bold)} {number} {date} {amount}», amber waiting line «بانتظار الاعتماد منذ اليوم|يوم|يومين|{n} أيام|{n} يوماً»; end: status badge + «⋯».
- **Table**: («رقم الصادر» in outgoing), «المستند», «النوع», «العميل» (avatar), «المشروع», «الحالة», «المبلغ», «آخر تعديل»/«تاريخ الصادر», actions.
- Empties: «سجل الصادر فارغ» / «بعد اعتماد عقد أو خطاب، اضغطوا «تسجيل صادر» في صفحته ليأخذ رقماً من هذا السجل.»; «لا توجد مستندات بعد» / «العقود والخطابات تُنشأ من مشاريعها وتُعبّأ تلقائياً، وعروض الأسعار من الفرص.» + «مستند جديد»; «تعذّر تحميل المستندات».
- «مستند» → Dialog «مستند جديد» with two choices: «عقد أو خطاب» («من قوالب الجهة، يُعبّأ من بيانات المشروع») and «عرض سعر» («بنود حرة أو من باقة، ويُطبع PDF»).
- **NewDocumentDialog** «مستند جديد» (wide): «المشروع» select «— اختر المشروع —» (+ «يُعبّأ المستند تلقائياً من بيانات المشروع وعميله وماليته.»); heading «عقد» → template tiles from `/api/documents/templates`: «عقد تقديم خدمات وتنفيذ مشاريع», «اتفاقية عدم إفصاح وسرية المعلومات», «عقد عمل», «عقد تقديم خدمات استشارية», «عقد (نموذج فارغ)» each «{n} بنداً · يُعبأ من بيانات المشروع»; heading «خطاب» → «كاش باك للجمعية من قيمة العقد» («بمبلغ الكاش باك من المالية»), «خطاب مخصص» («نص حر بترويسة الجهة»). Tile shows «جارٍ الإنشاء…». POST `/api/projects/{id}/documents` → opens editor. Error «اختر المشروع أولاً» / «تعذّر إنشاء المستند».
- **Document actions menu** (everywhere): «فتح»; section «تنزيل»: «تنزيل PDF» («بمقاس A4 كما يظهر»; server `/api/pdf`, fallback notice «نُزّل الملف بجودة الصورة لأن خدمة PDF غير متاحة مؤقتاً.»), «تصدير Word» («للتعديل على الصياغة»); (approved) «إرسال للعميل» («رابط آمن عبر واتساب أو البريد»); section «سير العمل»: «إرسال للمراجعة» / «اعتماد» («يقفل المستند ويحفظ نسخة منه») / «إعادة فتح للتعديل» / «تسجيل صادر» («رقم من سجل الصادر، نهائي»; confirm «تسجيل رقم صادر؟» / «يُعطى المستند رقماً من سجل الصادر يظهر في المطبوع. الرقم نهائي ولا يُعاد استخدامه.» / «تسجيل الصادر»); «نسخ كمستند جديد»; «حذف المسودة» (confirm «حذف هذه المسودة نهائياً؟» / «حذف نهائياً»). Quote rows menu: «فتح», «طباعة / PDF», «نسخة جديدة» («مسودة برقم جديد»), «فتح الفرصة».
- Endpoints: `GET/PATCH/DELETE /api/documents/{id}`, `POST /api/documents/{id}/status {to,version}`, `/duplicate`, `/outgoing`, `/shares` (GET/POST {days,channel}, DELETE).

### 10.2 Document editor (`/projects/$id/documents/$docId`)
- Top: back link «← مستندات المشروع»; title; «صادر: {ref}»; status line «للاطلاع والطباعة» / «اعتُمد {date} · مقفل عن التعديل» / autosave «جارٍ الحفظ…» «تعديلات غير محفوظة…» «حُفظ ✓» «يُحفظ تلقائياً»; DocStepper «مراحل المستند» (مسودة → مراجعة (with waiting days) → معتمد → صادر).
- Action buttons by state: «إرسال للمراجعة», «إعادة للمسودة», «اعتماد», «إرسال» (Share2), «تسجيل صادر», «إعادة فتح للتعديل», print «طباعة أو حفظ PDF», «⋯» «إجراءات المستند» (section «تنزيل وطباعة»: «تنزيل PDF», «تصدير Word», «طباعة / حفظ PDF»; «نسخ كمستند جديد»; «حذف المسودة»). Toasts «اعتُمد المستند», «أُرسل للمراجعة», «أُعيد للمسودة», «سُجّل رقم الصادر».
- Editor panel Segmented «لوحات التحرير»: «البيانات» | «البنود» (contract) / «النص» (letter) | «التنسيق"; with A4 live preview beside (desktop) — on phone, fit-to-width preview.
  - البيانات: «عنوان العقد»/«موضوع الخطاب», «رقم المستند» («يُولَّد تلقائياً ويمكن تعديله»); variable groups: contract «العقد», «القيمة والمدة», «الطرف الأول (الجهة)», «الطرف الثاني (العميل)»; letter «المرسل إليه», «الخطاب». Each variable hint «تلقائي · من بيانات الجهة|من بيانات العميل|من المشروع|من المالية|افتراضي» or «معدّل يدوياً» + «استعادة التلقائي».
  - البنود: list of clauses («المادة {n}: …»; «بند بلا عنوان») with «أعلى», «أسفل», «تعديل», «حذف» (confirm «حذف «{title}»؟» / «حذف البند»); select «إضافة بند من المكتبة…» + «إضافة» (library: «التمهيد», «التعريفات», «موضوع العقد», «التزامات الطرف الأول», «التزامات الطرف الثاني», «المقابل المالي وشروط الدفع», «مدة العقد», «السرية وعدم الإفصاح», «الملكية الفكرية», «القوة القاهرة», «إنهاء العقد», «التعويض», «حل النزاعات», «القانون المطبق والاختصاص القضائي», «التبليغات والإشعارات», «أحكام عامة», «التوقيعات»). Clause dialog «تعديل البند»: «عنوان البند (يُرقَّم تلقائياً)», «النص» («افصلوا الفقرات بسطر فارغ»), «إدراج متغير…», checkbox «يبدأ في صفحة جديدة», «حفظ البند».
  - النص (letter): «نص الخطاب» + «افصلوا الفقرات بسطر فارغ. المتغيرات مثل {{cashback_amount}} تُستبدل تلقائياً.»
  - التنسيق: «الخط والمسافات» sliders «حجم النص», «تباعد الأسطر», «حجم العنوان», «حجم عناوين البنود», «الهامش الجانبي (سم)»; «الترويسة والتوقيع» toggles «ترويسة الجهة أعلى كل صفحة», «تذييل الجهة أسفل كل صفحة», «خانة التوقيعات», «إدراج توقيع الجهة», «إدراج ختم الجهة»; «عبارة التذييل» («بدون», «سري», «مسودة», «نسخة طبق الأصل», «نهائي»); «الصور تُدار من الإعدادات › بيانات الجهة».
- «سجل الاعتماد»: «الإصدار {v} · اعتُمد {date}».
- **SendDialog** «إرسال {عقد|خطاب}»: «يصل المستلم رابط خاص يفتح النسخة المعتمدة للاطلاع والتنزيل دون حساب. الرابط ينتهي تلقائياً ويمكن إلغاؤه في أي وقت.»; «صلاحية الرابط» («7 أيام», «30 يوماً»), «جوال المستلم», «بريد المستلم»; buttons «واتساب», «بريد», «نسخ الرابط»/«نُسخ الرابط», disabled «من المنصة (قريباً)»; error «رقم الجوال غير صالح لواتساب (مثال: 0551234567).»; «الروابط الفعّالة ({n})»: «{channel} · أُنشئ {ago}», «ينتهي {date} · فُتح {n} مرة، آخرها {ago}|لم يُفتح بعد», «إلغاء» (confirm «إلغاء هذا الرابط؟» / «لن يفتح بعد الآن لمن أُرسل إليه.»); empty «لم يُرسل هذا المستند بعد.». Message template: «السلام عليكم ورحمة الله وبركاته،» / «نرسل لكم {kind} «{title}» من {org}.» / «للاطلاع والتنزيل: {url}» / «(الرابط صالح حتى {date})».
- **Public document** `/s/$token`: header «معتمد {date} · الرابط صالح حتى {date}», buttons «تنزيل PDF», «طباعة»; invalid «الرابط غير متاح» / «انتهت صلاحية هذا الرابط أو أُلغي. تواصلوا مع الجهة المرسِلة لطلب رابط جديد.»

---------------------------------------------------------------------------------------------------

## 11. Meetings & decisions

### 11.1 Meetings (`/meetings`; `GET /api/meetings?from&to&mine`, `GET /api/meetings/{id}`)
- PageHeader «الاجتماعات» / «المواعيد والحضور والمحاضر، وما خرج منها من قرارات»; primary «اجتماع» (+).
- Segmented «الفترة»: «القادمة» (CalendarDays) | «السابقة» (Clock); toggle «اجتماعاتي فقط».
- Grouped by day: heading «اليوم» (brand colour) / «غداً» / «أمس» / formatted date; cards grid (2 cols md).
- **MeetingCard**: title (whole card opens), status badge if not scheduled («عُقد» green / «أُلغي» gray); meta: 🕐 time (bold), 📍 location, 👥 attendee count; «{client} · فرصة: {request} · مشروع: {project}»; amber «{n} قرار مفتوح».
- Empty «لا اجتماعات قادمة» / «لا اجتماعات سابقة» + «جدول اجتماعاً مع فريقك أو عميلك، ودوّن محضره وقراراته بعده.»
- **Meeting detail dialog** (wide, `?open=id`): title; «{day} · {time} · {n} دقيقة», location, attendees «…، …» or «بلا حضور محددين», links to client / «{request|الفرصة}» / «{project|المشروع}»; buttons «عُقد» (mark done), «إلغاء» (cancel), edit (aria «تعديل الاجتماع»), delete (confirm «حذف الاجتماع؟» / «تبقى قراراته.» / «حذف الاجتماع»); «جدول الأعمال» (bullets); «المحضر» textarea (placeholder «ما نوقش وما اتُّفق عليه»), note «سُجّل هذا الاجتماع في سجل تواصل العميل.»; «القرارات ({n})» + «قرار» → DecisionList; empty «لم تُسجّل قرارات لهذا الاجتماع.» PATCH `/api/meetings/{id}`.
- **MeetingDialog** «اجتماع جديد» / «تعديل الاجتماع» (buttons «جدولة الاجتماع» / «حفظ»; toast «جُدول الاجتماع» / «حُفظ الاجتماع»): «عنوان الاجتماع» (placeholder «مثلاً: مراجعة خطة الملتقى»), «اليوم» (date), «الساعة» (time), «المدة» (15/30/45 «دقيقة», 60 «ساعة», 90 «1.5 ساعة», 120 «2 ساعة», 180 «3 ساعة»), «المكان أو الرابط», «الحضور» (toggle chips of team members), clash notice «تعارض في الموعد: {name} لديه «{title}» الساعة {time}.», «مع العميل», «عن الفرصة», «عن المشروع» (selects), «جدول الأعمال» (textarea «بند في كل سطر»). Error «تعذّر الحفظ: تأكد من العنوان والموعد.»

### 11.2 Decisions (`/decisions`; `GET /api/decisions?mine&status`)
- PageHeader «القرارات» / «ما تقرّر في الاجتماعات والمشاريع، ومن ينفّذه ومتى»; primary «قرار» (+).
- Pills: «المفتوحة», «المسندة إليّ», «المتأخرة», «المنتهية» (counts).
- **DecisionList** rows: round check (done = green ✓; aria «تم تنفيذ {title}»); title (struck when not open); meta «المسؤول: {owner}», 📅 «متأخر · {date}» (red) or date, link 👥 «{meeting title}», link «صار مهمة» (if converted); details text; badge «نُفّذ»/«أُلغي»; buttons «تحويل إلى مهمة» (POST `/api/decisions/{id}/task`), «⋯» «تعديل», «حذف القرار» (confirm «حذف القرار «{title}»؟»).
- Empty «لا قرارات بعد» / «سجّل قرارات الاجتماع في محضره، أو أضف قراراً مباشرة.» or «لا قرارات هنا».
- **DecisionDialog** «قرار جديد» / «تعديل القرار»: «القرار» (placeholder «ما الذي تقرّر؟»), «المسؤول عن التنفيذ» («— غير محدد —»), «الموعد» (date), «تفاصيل (اختياري)»; button «حفظ القرار»; toast «حُفظ القرار».

---------------------------------------------------------------------------------------------------

## 12. Settings — «الإعدادات»
- Phone/tablet: horizontal scrolling nav strip (icons + labels) of the settings tabs at the top of every settings page (active = brand-soft, semibold). Desktop: sidebar.

### 12.1 Overview (`/settings`)
- PageHeader «الإعدادات» / «ما يُضبط مرة واحدة ويظهر في كل عقد وتقرير. ابدؤوا بما ينقص.»
- Section cards (icon tile, title, meta with ✓ green or ⚠ amber, description, link «فتح» / «أكملوها»):
  - «بيانات الجهة» — meta «{filled} من {n} مكتمل»; «ما ينقص: {fields}» or «الاسم والأرقام الرسمية والمفوض والصور: تظهر في العقود والخطابات وكشوف الحساب.»
  - «المالية» — meta «الضريبة {rate}%»; «مستهدف {year}: {x} (من الإعدادات|من الخطة).» or «ما ينقص: مستهدف {year}. يُضبط من مؤشر الإيراد في خطة السنة»; «الرصيد الافتتاحي، وشروط المشاريع الجديدة، والضريبة.»
  - «الفريق والصلاحيات» — «{n} مستخدم نشط»; «من يدخل المنصة، وبأي دور، وما يراه كل دور.»
  - «سجل النشاط» — «من غيّر ماذا ومتى، بالقيم قبل التعديل وبعده.»
  - «البيانات» — «نسخة كاملة تحتفظون بها، والقوائم الأساسية في Excel، والاستيراد.»
  - «حسابي» — «كلمة المرور، ونمط الألوان على هذا الجهاز.»

### 12.2 Org «بيانات الجهة» (`/settings/org`; org profile API)
- PageHeader «بيانات الجهة» / «هوية مؤسستكم في كل عقد وخطاب: تُضبط مرة واحدة»; read-only notice «للاطلاع فقط. التعديل للمالك والمدراء.»
- Card «بيانات الجهة»: «اسم الجهة», «رقم السجل التجاري», «الرقم الضريبي», «الهاتف», «البريد الإلكتروني», «الموقع الإلكتروني», «العنوان». Card «المفوض بالتوقيع»: «اسم المفوض بالتوقيع», «صفته», «رقم الهوية». Card «البيانات البنكية»: «اسم البنك», «رقم الآيبان». Button «حفظ البيانات» + «حُفظ ✓».
- Card «الصور والترويسة» («تُرفع مرة واحدة وتُستخدم في كل المستندات.»): «شعار الجهة» («يظهر في أغلفة العقود والخطابات»), «الختم» («PNG بخلفية شفافة أفضل»), «التوقيع» («PNG بخلفية شفافة»), «الترويسة (رأس الصفحة)» / «تذييل الصفحة» («صورة عرضية بعرض A4»); buttons «رفع», «إزالة»; errors «الصورة أكبر من 2 ميجابايت», «الصيغة غير مدعومة (PNG أو JPG أو WEBP أو SVG)».
- Card «الترقيم»: per kind «البادئة», «الرقم التالي»; «حفظ الترقيم». Card «النصوص الافتراضية»: «شروط عرض السعر», «صلاحية العرض (أيام)» («0 = بلا تاريخ صلاحية»), «خاتمة الخطاب» (placeholder «وتفضلوا بقبول وافر التحية والتقدير،»); «حفظ النصوص».

### 12.3 Finance settings (`/settings/finance`)
- PageHeader «المالية» / «ما يُضبط مرة واحدة: مستهدف السنة، والرصيد الافتتاحي، وشروط المشاريع الجديدة، والضريبة.»
- «مستهدف الإيراد» (hint «شامل الضريبة، ويُقاس به «اليوم» و«مراجعة السنة». إن تُرك فارغاً يُؤخذ من مؤشر الإيراد في خطة السنة.»): per year «مستهدف {y} (ر.س)» (placeholder «غير محدد», hint «من الخطة الآن: {x}») + «حفظ».
- «الرصيد الافتتاحي»: «الرصيد (ر.س)», «بتاريخ», «حفظ», «آخر قيمة محفوظة: {x} بتاريخ {date}.»
- «شروط المشاريع الجديدة»: «نسبة الضريبة %», «شامل الضريبة», agreement items (type «مبلغ ثابت»/%, basis «من الصافي»/«من الإجمالي»), «حفظ الشروط».
- «توزيع الأرباح»: «نسبة التوزيع للشركاء %», «الباقي يُحتجز لـ» («احتياطي», «تشغيل», «تطوير»), «حفظ».
- «الضريبة»: «نسبة الضريبة %» («لا تتغير فواتير سُجّلت سابقاً»), «دورة الإقرار» («ربع سنوي», «شهري»), «الرقم الضريبي للجهة: {x|غير مسجّل}» + «تعديله من بيانات الجهة», «حفظ الضريبة».

### 12.4 Team «الفريق والصلاحيات» (`/settings/team`)
- PageHeader «الفريق والصلاحيات» / «من يدخل المنصة، وبأي دور، وما يراه كل دور.»; Segmented «المستخدمون» | «الأدوار والصلاحيات».
- Users: «{n} مستخدم نشط» + «دعوة مستخدم»; rows avatar/name/email/role, badge «موقوف» (red) / «بانتظار التفعيل» (amber) / «نشط» (green), «آخر دخول {ago}» / «لم يسجّل دخولاً»; menu «تغيير الدور أو الاسم», «رابط تعيين كلمة مرور», «إيقاف الحساب» / «إعادة التفعيل». Invite dialog «دعوة مستخدم»: «الاسم», «البريد الإلكتروني», «الدور» (hint = role description); «إنشاء الدعوة» → «رابط التفعيل» dialog («أرسل هذا الرابط إلى {name} ليختار كلمة مروره. صالح لمدة 7 أيام ويُستخدم مرة واحدة.», «نسخ الرابط»/«تم النسخ»). Edit «تعديل المستخدم».
- Roles panel: role list («{n} مستخدم»), «دور جديد»; editor «اسم الدور», «المشاريع التي يراها» (scope), «وصف مختصر», permission matrix grouped «العمل اليومي», «المالية», «المبيعات والتخطيط», «الإدارة»; «ما يراه ويفعله هذا الدور» summary («أرقام الأرباح مخفية عنه.»); buttons «حفظ الدور», «تراجع», «إعادة للوضع الجاهز», «حذف الدور»; badge «معدّل»/«جاهز»; notices «تم الحفظ. تسري التغييرات فوراً على كل من له هذا الدور.», «دور المالك ثابت: كل الصلاحيات، ولا يمكن تقييده.»

### 12.5 Activity «سجل النشاط» (`/settings/activity`) — read-only
- «من غيّر ماذا ومتى، بالقيم قبل التعديل وبعده.»; FilterBar «القسم» («كل الأقسام»; «المشاريع», «العملاء», «المستندات», «مالية الشركة», «الضريبة», «المنتجات», «الطلبات», «الموقع», «المنشأة», «المستخدمون», «الأدوار», «الملفات», «الاستيراد», «المهام», «عروض الأسعار», «الخطط», «الاجتماعات», «القرارات»), «المستخدم» («كل المستخدمين»); «نطاق التاريخ» «من تاريخ» / «إلى تاريخ».
- Rows: action text, «{user|النظام} · {date، time} · {ago}», changes «المبلغ: 50,000 ر.س ← 5,000 ر.س». Empty «لا نشاط مطابق» / «تظهر هنا التغييرات التي يجريها الفريق.»

### 12.6 Data «البيانات» / Quality / Import
- Data: «نسخة احتياطية» («ملف واحد بكل سجلات المنشأة…»; «آخر تنزيل: {ago}، بواسطة {user}.»; «تنزيل نسخة كاملة (JSON)», «العملاء والمشاريع والمقبوضات (Excel)»), «التخزين المستخدم» («الشعارات والأختام والمرفقات المرفوعة.» «· {n} ملف»), «الاستيراد» («نقل العملاء والمشاريع من المنصة السابقة.» + «فتح الاستيراد»).
- Quality «الجودة والامتثال»: checklist groups («إتاحة الوصول», «الجوال والأجهزة», …) with badges «منجز» (green) / «جزئي» (amber) / «مخطط» (gray); each row «what» + «how».
- Import «استيراد من المنصة الحالية» / «انقلوا عميلاً أو أكثر بكامل بياناته ومشاريعه لتجربة الإصدار الثاني»: steps (export from old platform «الإعدادات» › «إدارة البيانات» › «تصدير البيانات»), drop zone «اختاروا ملف التصدير أو اسحبوه هنا» / «ملف JSON من «تصدير البيانات»»; then «{n} عميل · {m} مشروع في الملف», buttons «المقترَحون للتجربة», «الكل», «إلغاء التحديد», «ملف آخر»; table «العميل», «المشاريع», «اكتمال البيانات»; summary «{n} عميل و{m} مشروع». Errors «هذا الملف ليس ملف تصدير من المنصة الحالية.», «الملف لا يحتوي عملاء.», «الاستيراد متاح لمالك المنصة فقط.»

### 12.7 Account «حسابي» (`/settings/account`)
- PageHeader «حسابي» / «كلمة مرورك، ونمط الألوان على هذا الجهاز.»
- Card «تغيير كلمة المرور» («تُسجَّل بعدها خارج المنصة في أجهزتك الأخرى.»): «كلمة المرور الحالية», «كلمة المرور الجديدة» (hint/error «8 أحرف على الأقل»), button «تغيير كلمة المرور»; toast «تم تغيير كلمة المرور»; errors «كلمة المرور الحالية غير صحيحة.», «محاولات كثيرة متتالية. انتظروا دقيقة ثم أعيدوا المحاولة.»
- Card «الأجهزة»: «إن فُقد جهاز أو دخلتم من جهاز عام، أخرِجوا كل الأجهزة الأخرى. يبقى هذا الجهاز داخلاً.» + «خروج من كل الأجهزة الأخرى» (confirm «الخروج من كل الأجهزة الأخرى؟» / «سيلزم تسجيل الدخول من جديد في أي جهاز آخر.» / «إخراج الأجهزة الأخرى»; toast «خرجت كل الأجهزة الأخرى»).
- Card «مفتاح الاستعادة»: explanation; after creation «احفظوا المفتاح الآن، فلن يظهر مرة أخرى:» + key + «نسخ المفتاح»; status «لديكم مفتاح فعّال منذ {date}.» / «لا يوجد مفتاح بعد.»; button «إنشاء مفتاح استعادة» / «إنشاء مفتاح جديد» (confirm «إنشاء مفتاح جديد؟» / «المفتاح القديم يتوقف عن العمل فوراً.»).
- Card «المظهر» («نمط الألوان على هذا الجهاز.»): 3 choices «نهاري», «ليلي», «حسب الجهاز» with icons Sun/Moon/Monitor and hints.

### 12.8 Login / setup / recover
- AuthLayout: phone = navy (`#00197d`) top band with white logo, then form; desktop = split screen: navy panel (logo, «منصة واحدة لإدارة مشاريعكم وجمعياتكم وحوكمتكم», «بُعد التمكين», faint huge logo mark) + form side with theme toggle at top-left.
- Login «تسجيل الدخول»: «البريد الإلكتروني» (error «أدخل بريداً إلكترونياً صحيحاً»), «كلمة المرور», button «دخول», links «نسيت كلمة المرور؟», «إعداد أول مرة: إنشاء حساب المالك». Errors «البريد الإلكتروني أو كلمة المرور غير صحيحة», «محاولات دخول كثيرة. انتظر دقيقة ثم حاول مجدداً.»
- Invite link (?token): «تعيين كلمة المرور»: «كلمة المرور الجديدة», «تأكيد كلمة المرور», «حفظ ودخول»; errors «كلمتا المرور غير متطابقتين», «كلمة المرور يجب ألا تقل عن 8 أحرف», «انتهت صلاحية الرابط، حاول تسجيل الدخول من جديد».
- Recover «استعادة الدخول»: «البريد الإلكتروني», «مفتاح الاستعادة», «كلمة المرور الجديدة», «تأكيد كلمة المرور», «حفظ ودخول»; note «المفتاح يُنشأ من «الإعدادات ← حسابي» ويعمل مرة واحدة. لا تملكون مفتاحاً؟ يستطيع مسؤول المنصة إرسال رابط تعيين كلمة مرور لكم من «الفريق والصلاحيات».»; «العودة إلى الدخول».
- Setup «إعداد حساب المالك»: «تُجرى هذه الخطوة مرة واحدة فقط…»; «رمز الإعداد», «الاسم», «البريد الإلكتروني», «كلمة المرور (12 حرفاً فأكثر)», «تأكيد كلمة المرور»; «إنشاء الحساب والدخول».

---------------------------------------------------------------------------------------------------

## 13. Lighter coverage

### 13.1 Reports «التقارير» (`/reports`)
- PageHeader «التقارير» / «كل تقارير المنصة في مكان واحد. اختر الفترة مرة، وتنتقل مع التقرير الذي تفتحه.»; «الفترة» picker; SearchBox «ابحث عن تقرير بالاسم أو بما يجيب عنه»; group «المفضلة» (star toggle «إضافة {title} إلى المفضلة»).
- Groups: «المالية», «المشاريع والتنفيذ», «المبيعات», «التخطيط والأداء», «العملاء», «الامتثال والسجلات». Each report card: title + question + format chips «عرض» / «PDF» / «Excel» (+ perRecord note):
  - «التقرير المالي للجهة» — «ما وضعنا المالي في الفترة: الإيرادات والمصروفات والأرباح والالتزامات؟»
  - «لوحة المالية» — «أي المشاريع تربح وأين يذهب الصرف، مقارنةً بالفترة السابقة؟»
  - «أعمار الديون وتوقّع النقد» — «من تأخر في السداد، وكم سيدخل الحساب في الأسابيع القادمة؟»
  - «أرباح الربع والتوزيع» — «كم تحقق من الأرباح في الربع وكم يمكن توزيعه؟»
  - «مالية الشركة» — «دخل الخدمات ومصروفات الشركة وصافي الربح.»
  - «إقرار ضريبة القيمة المضافة» — «ما الذي نصرّح به للهيئة عن الربع: المبيعات والمشتريات والضريبة؟»
  - «محفظة المشاريع» — «كل مشروع: تقدّمه وموعده وما حُصّل منه وما يستحق.»
  - «التنفيذ والإنتاجية» — «ما المنجز والمتأخر لكل شخص ومشروع، وكم ساعة سُجّلت؟»
  - «التقرير المالي للمشروع» — «كشف معاملات المشروع للعميل، أو تقريره التفصيلي بالأرباح.» (perRecord «من قائمة «⋯» في صفحة المشروع»)
  - «تحليلات المبيعات» — «القمع ونسبة الكسب والمصادر والمكسوب شهرياً، للفترة المختارة.»
  - «عروض الأسعار» — «ما أُرسل وما قُبل ورُفض، وما ينتهي قريباً.»
  - «كشف حساب العميل» — «مشاريع العميل وعقوده وما دفعه وما تبقى عليه.» (perRecord «من صفحة كل عميل: «كشف حساب»»)
  - «متابعة الخطة» — «أين نقف من المستهدفات: الإيرادات والمؤشرات والمبادرات.»
  - «أداء المنتجات والخدمات» — «أي خدمة تبيع أكثر وتربح أكثر، والفعلي مقابل المخطط.»
  - «سجل الصادر» — «كل مستند صدر برقم، ومتى.»
  - «سجل النشاط» — «من فعل ماذا ومتى.»
  - «الاجتماعات والقرارات» — «ما تقرّر، ومن المسؤول، وما تأخر تنفيذه.»
- Empty «لا تقارير متاحة لدورك» / «لا تقرير بهذا الاسم».

### 13.2 Plans «الخطط» (`/plans`)
- PageHeader «الخطط» / «الاستراتيجية والتشغيلية: الأهداف ومؤشراتها ومتابعتها»; Segmented «نوع الخطة» «الخطة الاستراتيجية» | «الخطة التشغيلية»; plan select; buttons «خطة جاهزة», «خطة جديدة».
- Empty «لا توجد خطة استراتيجية بعد» («ابدأ بالرؤية والرسالة والقيم، ثم أضف أهدافاً لها مؤشرات ومستهدفات.») / «لا توجد خطة تشغيلية بعد» («اجعل السنة أربعة أرباع، واربط أهدافها بالخطة الاستراتيجية.»); «أنشئ خطة السنة الأولى», «خطة فارغة».
- Plan header: dates «{start} – {end}», status, «تعديل الخطة»; ProgressBar «تقدّم الخطة»; «الرؤية», «الرسالة», «القيم» («لم تُكتب بعد.» / «لم تُحدَّد بعد.»); «إجمالي ميزانيات الأهداف: {n} ر.س · تخدم: {parent}».
- Segmented «طريقة العرض» «الأهداف» | «المتابعة»; quarter filter «كل السنة», «الربع 1..4».
- ObjectiveCard: title, badges «الربع {q}», «المسؤول: {x}», «الميزانية: {x}», «يخدم: {parent}»; progress; «مؤشرات الأداء» (+ «مؤشر»; «{current|مخفي} / {target} {unit}», badge «من المنصة»; empty «لا مؤشرات بعد. أضف مؤشراً ليُقاس التقدّم بالأرقام.»); «المبادرات» (+ «مبادرة»; status, «حتى {date}», «مهام {done}/{total}»; empty «لا مبادرات بعد.»; «عرض المنجزة ({n})»/«إخفاء المنجزة»); review line «آخر مراجعة (الربع {q}): {note|بلا ملاحظات}» / «لم تُراجع بعد.» + «مراجعة». Delete goal confirm «حذف الهدف «{title}»؟» / «تُحذف معه مؤشراته ومبادراته.»
- Tracking tab: revenue target card «لوحة المستهدف» («من {target}», «متقدّم على المسار»/«خلف المسار», «المتوقع حتى اليوم» «بخط سير متساوٍ», «المتوقع نهاية الفترة»), monthly bars (months «ينا»…«ديس»).

### 13.3 Products «المنتجات والخدمات» (`/products`, `/products/$id`)
- List: PageHeader «المنتجات والخدمات» / «ابنِ منتجات مميزة للجمعيات: باقات وتكلفة وتسعير وتشغيل، ثم انشرها في الموقع.» + «منتج جديد»; Segmented «المنتجات» | «نظرة عامة». Product cards «{n} باقات · جاهزية {a}/{b}», status badge, «ظاهر في الموقع». Empty «لا توجد منتجات بعد» / «ابدأ من أحد القوالب الجاهزة أدناه، أو أنشئ منتجاً فارغاً.». Section «قوالب جاهزة» («كل قالب يحمل المحتوى والباقات والاستبيان ومراحل التشغيل…»; «{n} قوالب جاهزة لم تُنشأ بعد.» + «إنشاء الكل كمسودات»; tile button «ابدأ من هذا القالب»). Overview table «الخدمة», «المشاريع», «الجهات», «قيمة العقود», «الربح», «الهامش الفعلي / المخطط», «الطلبات».
- Builder (`/products/$id`): back «← المنتجات والخدمات», status badge, «تغييرات غير محفوظة»/«كل التغييرات محفوظة», «حفظ». Steps (StepNav on phone): «التعريف», «الباقات», «التكلفة والتسعير», «الأداء», «الاستبيان», «التشغيل والمحتوى», «النشر». Identity fields «اسم المنتج», «رابط المنتج في الموقع», «وصف مختصر», «تصنيف يظهر فوق العنوان», «العنوان الرئيسي», «الوصف التفصيلي», «وسوم قصيرة», «صورة الغلاف (اختيارية)». Packages «إضافة باقة» («اسم الباقة», «إبرازها كالأكثر شمولاً», «لمن تناسب؟», «مزاياها»). Pricing «1. بنود التكلفة», «2. كيف يُحسب السعر», «3. كميات كل باقة وسعرها» (internal-only notice). Intake questions («السؤال», «نوع الإجابة»: «نص», «رقم», «اختيار واحد», «اختيار متعدد», «إلزامي»). Content sections (problems, offerings, model, benefits, comparison, process, roles, standards, deliverables, proof, FAQ). Publish: «الجاهزية للنشر», «الحالة والظهور», «الملف التعريفي بالخدمة (PDF)».
- Requests inbox (now under sales): «تسجيل طلب يدوياً», request rows «{product|طلب عام} · {ago} · {من الموقع|يدوي}», «تسجيل اهتمام».

### 13.4 Website editor «الموقع» (`/website`)
- Header «الموقع» + badge «منشور» / «منشور، وفيه تعديلات غير منشورة» / «غير منشور»; «آخر نشر {ago}» or «حرّر المحتوى وراقب المعاينة ثم انشره ليراه الزوار.»; buttons «فتح المعاينة», «نشر» («جارٍ النشر…»), unpublish; toasts «تم نشر الموقع», «أُوقف النشر».
- Tabs: «نظرة عامة», «الهوية والتواصل», «الصفحة الرئيسية», «الخدمات والمنتجات», «الجهات والأعمال», «نموذج الطلب», «البحث والمشاركة», «سجل النشر».
- Preview (desktop xl aside) with device switch «جوال» (390) / «لوحي» (768) / «حاسوب» (1280); «احفظ لتحديث المعاينة» / «معاينة المسودة»; save bar «حفظ».

### 13.5 Public site (`/site`)
- Nav anchors «الخدمات», «منتجاتنا», «كيف نعمل», «أعمالنا», «أسئلة شائعة»; hero with CTA «اطلب عرضاً» and stats («بالأرقام»); «ما الذي تحتاجه؟» quick chips; products section «منتجاتنا» / «حلول جاهزة بخبرة مجرّبة» (cards «خدمة متخصصة», «· قريباً», «التفاصيل», «اطلب عرضاً»/«سجّل اهتمامك», «تعرّف على الخدمة»); testimonials «آراء عملائنا» / «قالوا عنّا»; FAQ. Fonts: Thmanyah Sans / Serif Display. Unavailable «الموقع قيد الإعداد» / «سيكون متاحاً هنا قريباً.»; preview banner «معاينة المسودة: لا يراها الزوار قبل النشر · … · العودة إلى إدارة الموقع».
- Request form dialog «اطلب عرضاً» («الاسم», «الجهة», «الجوال», «البريد الإلكتروني», intake questions, «ملاحظات», button «إرسال الطلب»; success «وصلنا طلبك» / «شكراً لك. سنتواصل معك قريباً بنموذج التنفيذ المناسب.»; errors «اكتب رقم الجوال أو البريد الإلكتروني لنتواصل معك.», «أجب عن الأسئلة المطلوبة.»).

---------------------------------------------------------------------------------------------------

## 14. Phone-specific behaviour summary (for the iOS prototype)
- Breakpoints: phone `<640px` (sm), tables switch to cards `<768px` (md), sidebar/bottom bar switch at `1024px` (lg).
- Bottom tab bar (5): «اليوم», «المبيعات», «المشاريع», «المالية», «المزيد» (opens right-side drawer «القائمة» with everything else: «التقارير», «التخطيط» (الخطط/المنتجات والخدمات/الموقع), «المستندات», «الإعدادات», «قريباً», plus account, «إنشاء جديد», «الأخيرة»). Note: «المستندات» is NOT in the bottom bar.
- Top bar: logo icon (start), search icon + bell (end). Search opens full palette.
- Section tabs as a scrolling underline strip under the header for: home (اليوم/مهامي/الاجتماعات/القرارات), sales (الفرص/العملاء), planning (الخطط/المنتجات والخدمات/الموقع). Finance uses its own full-width Segmented; settings its own icon strip.
- FAB «+» only on «اليوم» (bottom-left, above tab bar).
- All dialogs are bottom sheets (88dvh, rounded top, sticky footer with full-width primary button, then «إلغاء»); no autofocus on phone.
- Filters collapse to one «تصفية» button → sheet; active filters as chips.
- Page header secondary actions collapse into «⋯».
- Lists → cards; DataTable → title + 3 figures per row.
- Kanban on phone → stage Segmented chips + cards of the selected stage. Task board scrolls horizontally (17rem columns).
- Project page on phone: order contract card → work area → details → meetings; sticky project bar after scrolling (name+status row, then tabs row, compact icon actions).
- Touch targets ≥44px (`min-h-11`); inputs 16px font.
- Safe-area insets respected on tab bar, sheets and drawer.
- Toasts appear at the bottom (above tab bar).
