# بُعد — نظرة عامة + الهوية البصرية (مرجع بلا مستودع)

Snapshot commit: c769be0 (main, Merge PR #213). Raw copy of all 646 tracked files: `../repo/`.
Repo: github.com/mhwar/buad-platform. iOS plan: `../repo/v2/docs/ios-plan.md` (PR #215, branch claude/laughing-hypatia-62mgtb).

## Layout of repo
- Root = **v1**: static site (index.html landing, app.html 1.7MB single-file dashboard, project-template.html, plan.html, org-site.html), Cloudflare Pages Functions `functions/api/[[all]].js` (D1 `BUAD_DB`, djb2 passwords, assets base64 in D1), `migrations/001..009`.
- `v2/` = **current platform** (pnpm monorepo, node>=22, pnpm 10.28):
  - `apps/web` React 19 + TS + Vite 7, TanStack Router/Query, Tailwind 4, Radix dialog/dropdown, react-hook-form + zod 4, lucide-react icons, exceljs, jspdf, RTL Arabic.
  - `apps/api` Hono 4 on Cloudflare Workers (`buad-v2`), Drizzle on D1 `buad-v2` (id 33b6bb7c-c22c-4796-892a-ac0e94a024d2), R2 `buad-v2-files`, Browser Run (PDF), LOGIN_LIMITER 10/min, observability. One worker serves API + SPA assets. 32 migrations.
  - `packages/domain` pure logic (money in halalas), `packages/schema` Zod + Drizzle tables, `tools/migrate` v1→v2 one-way.
  - Scripts: `pnpm dev:api` (8787), `pnpm dev:web` (5173 proxies /api), `pnpm verify` = lint(biome)+typecheck+test+build. CI: `.github/workflows/v2-ci.yml`, `v2-deploy.yml` (D1 backup before migrations, e2e gate; secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, JWT_SECRET, OWNER_SETUP_TOKEN).
- Rules: money integers in halalas only; a module moves to v2 only after parity test vs v1 numbers; no edits outside v2/ from v2 work. Commit messages: short, Arabic or English, prefixed "v2:".

## Auth (important for mobile)
- Session = JWT HS256 {sub, org, role, v(tokenVersion), kind:"session", exp}, cookie `buad_session` HttpOnly Secure SameSite=Strict, TTL 12h.
- `requireAuth` accepts cookie OR `Authorization: Bearer <jwt>` → re-reads user; tokenVersion mismatch = revoked.
- Login `POST /api/auth/login {email,password}` sets cookie only (no token in body) → mobile needs a new endpoint.
- Other: /api/setup/status, /api/setup/owner, /api/auth/setup-password (invite token), /api/auth/logout, /api/auth/change-password, /api/auth/recovery-key (GET/POST), recovery flow, /api/me → {user:{id,orgId,email,name,role,roleKey,perms[],scopes{}}}.
- Permissions strings "module.action": tasks.view, meetings.view, sales.view, clients.view, projects.view, documents.view/edit, treasury.view, finance.edit, plans.view, products.view, site.view, team.view, audit.view, org.edit, import.run …

## Navigation registry (features/more/tabs.ts) — the single source
Phone bottom bar = PHONE_CORE [home, sales, projects, finance] + «المزيد». Sidebar lower: settings, soon.

| key | label (short) | path | icon (lucide) | tint | perm | attention | tabs |
|---|---|---|---|---|---|---|---|
| home | مساحة العمل (اليوم) | / | LayoutDashboard | indigo | – | – | اليوم `/`؛ مهامي `/tasks` (tasks.view, att tasks)؛ الاجتماعات `/meetings` (meetings.view)؛ القرارات `/decisions` (meetings.view, att decisions) |
| sales | المبيعات | /sales | ShoppingCart (single→Users) | emerald | – | – | الفرص `/sales` (+/sales/quotes, /analytics, /followups; sales.view; att requests, followups)؛ العملاء `/clients` (clients.view) |
| projects | المشاريع | /projects | Briefcase | sky | projects.view | overdue | – |
| documents | المستندات | /documents | Files | amber | documents.view | docs | – |
| finance | المالية | /finance | Landmark | teal | treasury.view | – | نظرة عامة؛ التحصيل `?tab=receivables` (att instalments)؛ الضريبة `?tab=vat`؛ الأرباح والتوزيع `?tab=profit` |
| reports | التقارير | /reports | BarChart3 | rose | – | – | – |
| planning | التخطيط | /plans | Target | violet | – | – | الخطط (plans.view, att initiatives)؛ المنتجات والخدمات `/products`؛ الموقع `/website` |
| settings | الإعدادات | /settings | Settings | slate | – | – | نظرة عامة، بيانات الجهة، المالية، الفريق والصلاحيات، سجل النشاط، البيانات، الجودة والامتثال، حسابي |
| soon | قريباً | /soon | Clock | slate | – | – | الموردون والمشتريات، الموارد البشرية، الامتثال والوثائق، المعرفة والقوالب، بوابة العميل والمانح، الفواتير الإلكترونية |

Hints (verbatim): home «يومك: مهامك واجتماعاتك وقراراتك وما يحتاج انتباهك»؛ sales «الفرص والعملاء وعروض الأسعار»؛ projects «المشاريع ومراحلها وماليتها وتنفيذها»؛ documents «العقود والخطابات وعروض الأسعار، مسودةً وصادرةً»؛ finance «النظرة العامة والتحصيل والضريبة والأرباح والتوزيع»؛ reports «كل التقارير في مكان واحد: المالية والمشاريع والمبيعات والخطط»؛ planning «الخطط وما نقدّمه من خدمات وكيف نعرضه»؛ settings «بيانات الجهة والفريق والصلاحيات وسجل النشاط وحسابي».
Tab descriptions verbatim are in `../repo/v2/apps/web/src/features/more/tabs.ts`.

## Home «اليوم» (home.tsx) structure
1. Header: long date (ar-SA, latin digits, gregorian, weekday) + «صباح الخير/مساء الخير/مساء النور»، {first name}.
2. If treasury.view: YearTargetCard compact (الإيراد مقابل المستهدف) + buttons «تسجيل مقبوض» (finance.edit → ReceiptFlow) and «مراجعة السنة».
3. ImportHint (import.run).
4. AttentionPanel «ما يحتاج انتباهك» (GET /api/attention → items {key,tone warn|info,title,count,link}). Known items: followups «متابعات مبيعات وعملاء حان موعدها» → /sales/followups; requests «طلبات عروض لم يُتواصل معها منذ أكثر من 3 أيام» → /sales; quotes-expiring «عروض أسعار تنتهي صلاحيتها خلال 3 أيام»; quotes-waiting «عروض أُرسلت ولم يُردّ عليها منذ أسبوع» → /sales/quotes; docs «مستندات بانتظار الاعتماد» → /documents?status=review; overdue projects; tasks; decisions; instalments; initiatives…
5. Main column: مهامي (groups متأخرة/اليوم/القادمة, circle check to complete → PATCH /api/tasks/:id {status:"done"}; empty «لا مهام مفتوحة عليك. يوم هادئ!»; link «كل مهامي»)، اجتماعاتي (this week, «soon» within 60 min)، قراراتي.
6. Aside «أرقامك»: المتابعات، أرقام المبيعات، أرقام المشاريع.

## Design tokens (index.css @theme) — copy as CSS vars
Font: "IBM Plex Sans Arabic" 400/500/600/700 (fallback Segoe UI, Tahoma, system-ui). Brand fonts for public site: Thmanyah Sans (Light/Regular/Medium/Bold/Black) + Thmanyah Serif Display (Bold/Black) → copied to `../proto-assets/`. Logo navy `#00197d` (`../proto-assets/logo.svg`, `logo-icon.svg`).
Identity: neutral surfaces + one warm accent orange; primary actions are ink (black) on light / light on dark; accent = "you are here", progress, highlights.

| token | light | dark |
|---|---|---|
| brand | #171717 | #f2f2f2 |
| brand-strong | #000000 | #ffffff |
| brand-soft | #eeece8 | #262626 |
| accent | #f5a524 | #f5a524 |
| accent-soft | #fdf0d9 | #3a2a10 |
| accent-ink | #9a5800 | #f7b955 |
| surface | #ffffff | #1a1a1a |
| canvas | #f4f3f1 | #0b0b0b |
| chrome | #ffffff | #141414 |
| ink | #171717 | #f2f2f2 |
| muted | #66635e | #a8a6a2 |
| line | #e7e4df | #2c2b29 |
| series-1 / series-2 | #2a78d6 / #eb6834 | #3987e5 / #d95926 |
| success / soft / ink / line | #16a34a / #ecfdf3 / #157f3c / #bbf7d0 | #22c55e / #0f2a1a / #4ade80 / #14532d |
| warning … | #d97706 / #fff7e6 / #9a5800 / #fde2b0 | #f59e0b / #2e2108 / #fbbf24 / #5a3d0a |
| danger … (+strong) | #dc2626 / #fef2f2 / #b91c1c / #fecaca (strong #b91c1c) | #dc2626 / #2c1212 / #f87171 / #5c1d1d (strong #ef4444) |
Radii: card 1.25rem, control 0.75rem. Shadows: card `0 1px 2px rgb(0 0 0/.04)`, raised `0 8px 24px rgb(0 0 0/.12)`. Slate greys warm (50 #faf9f7 … 900 #1a1a1a). Focus outline 2px accent.
Section icon tiles (TINT): `bg-{hue}-50 text-{hue}-600` (dark `bg-{hue}-950/60 text-{hue}-300`) for indigo/emerald/sky/amber/teal/violet/rose/slate.
Buttons: min-h 44px (phones), rounded-lg, text-sm semibold; primary bg-brand text-white; secondary border bg-surface; ghost text-muted; danger bg-danger. Inputs: rounded-lg border-line bg-surface px-3 py-2.5 text-base, focus ring accent/30.
Phone tab bar: fixed bottom, border-t, bg-surface/95 blur, safe-area padding, items min-h-14, text-xs; active = text-brand + 3px accent bar at top (inset-x-5, rounded-b).
Theme: user picks light/dark/system → `<html data-theme>`.
UI primitives (components/ui.tsx): Button, Field, Input, Textarea, Select, SearchBox, Badge(tone), Card, Avatar, EmptyState, PageHeader, ScrollRow, LayoutToggle, Pills, ViewToggle, Tabs, Info, Notice, Dialog/DialogActions, confirmAction, toast, Menu, Sheet (bottom sheet), Segmented, BadgeMenu, Stamp.

## Formatting (lib/format.ts)
- money(halalas) → formatSar from domain; sar(riyals): Intl ar-SA-u-nu-latn currency SAR, whole → no decimals («50,000 ر.س.»), else 2 decimals.
- pct → "12.3%". day("2026-03-01") → «1 مارس 2026» (ar-SA-u-ca-gregory-nu-latn). monthOf → «مارس 2026». ago(epochSec) → «منذ 3 أيام/أمس/الآن» (Intl.RelativeTimeFormat ar).
- Latin digits everywhere, Gregorian calendar.

## Other knowledge files
- 02-data-and-api.md — tables, enums, routes, permissions, business rules
- 03-screens-and-ux.md — every screen with verbatim Arabic texts
- 04-domain-infra-v1.md — domain formulas, sample data, CI/infra, v1
