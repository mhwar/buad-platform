# منصة بُعد — الإصدار الثاني (v2)

مشروع منفصل تماماً عن المنصة الحالية (v1). لا يقرأ من v1 ولا يكتب فيه؛ البيانات تُنقل إليه عبر أداة ترحيل أحادية الاتجاه (`tools/migrate`، المرحلة 1).
الخطة الكاملة والمراحل: https://claude.ai/code/artifact/c49b93fb-2e0a-4aa9-9bd7-9159d0e73bc5

## الهيكل

| المسار | الدور |
|---|---|
| `apps/web` | الواجهة: React 19 + TypeScript + Vite، TanStack Router/Query، Tailwind 4، RTL |
| `apps/api` | الخادم: Hono على Cloudflare Workers، عميل مُنمَّط الأنواع (`hono/client`) |
| `packages/domain` | المنطق الصرف (المال بالهللات، التوزيع، لاحقاً الحوكمة والمالية) مع اختبارات |
| `packages/schema` | مخططات Zod + جداول Drizzle (D1) — مصدر واحد للأنواع |

## التشغيل

```
pnpm install
pnpm dev:api   # http://localhost:8787
pnpm dev:web   # http://localhost:5173 (يمرّر /api إلى الخادم)
pnpm verify    # فحص + أنواع + اختبارات + بناء (نفس بوابة CI)
```

## قواعد

- المال أعداد صحيحة بالهللات فقط (`@buad/domain`).
- لا تنتقل وحدة إلى v2 إلا بعد اختبار مطابقة أرقامها مع v1 على بيانات حقيقية.
- لا تعديل على أي ملف خارج `v2/` من هذا المشروع.

## قيد المرحلة 0 (يحتاج قراراً)

ربط D1 وR2 والنطاق الجديد ينتظر ربط Cloudflare واختيار الرابط. الربط المعلّق موثّق في `apps/api/wrangler.jsonc`.

## النطاق (الدومين)

المشروع لا يحتوي أي نطاق مكتوب في الكود: الواجهة تستدعي `/api` نسبياً، والجلسة كوكي مرتبطة بالنطاق الذي تُخدم منه. لذا يكفي ربط أي نطاق محجوز (أو نطاق فرعي) من Cloudflare ليعمل دون تعديل كود.

## الأمان (المرحلة 1)

- كلمات المرور: PBKDF2-SHA256 بملح عشوائي. كلمات مرور v1 (djb2) تُتحقق مرة واحدة عند أول دخول ثم تُرقّى تلقائياً.
- الجلسة: كوكي `HttpOnly; Secure; SameSite=Strict` لمدة 12 ساعة، وتُلغى فوراً بتغيير `token_version`.
- `JWT_SECRET` إلزامي (لا قيمة افتراضية) — يُضبط بـ `wrangler secret put JWT_SECRET`.
- كل استعلام يُقيَّد بـ `org_id` للمستخدم؛ انظر `GET /api/users` والاختبار `isolates organisations`.
- مؤجل للإنتاج: تحديد معدل المحاولات (Cloudflare Rate Limiting) على `/api/auth/login`.

## أداة الترحيل (`tools/migrate`)

أحادية الاتجاه: تقرأ ملف لقطة JSON من v1 ولا تتصل بـ v1 إطلاقاً، وتُنتج `import.sql` (آمن للتكرار) و`report.md` (يسرد المرفوض بالاسم).

```
pnpm --filter @buad/migrate plan <v1-snapshot.json> <out-dir>
```

استعلامات اللقطة في `tools/migrate/v1-export.sql`. قاعدة v2 على Cloudflare: `buad-v2` (مرتبطة في `apps/api/wrangler.jsonc`، والمخطط الأول مُطبَّق).

## النشر على رابط تجريبي

Worker واحد باسم `buad-v2` يخدم الواجهة والـ API معاً (نفس الأصل، فالكوكي تعمل). الرابط الناتج: `https://buad-v2.<حسابكم>.workers.dev`.

**الخيار أ — من GitHub (موصى به):** أضيفوا ثلاثة أسرار في Settings → Secrets → Actions:
`CLOUDFLARE_API_TOKEN` (صلاحيات: Workers Scripts:Edit وD1:Edit)، `CLOUDFLARE_ACCOUNT_ID`، `JWT_SECRET` (نص عشوائي ≥ 32 حرفاً)،
ثم Actions → **v2-deploy** → Run workflow.

**الخيار ب — من جهازكم:** `wrangler login` ثم `wrangler secret put JWT_SECRET` ثم `pnpm deploy` من مجلد `v2`.

**المالك الأول** (أنتم تختارون كلمة المرور، لا تمر بأي أداة أو محادثة):
```
BOOTSTRAP_PASSWORD='كلمة-مرور-طويلة' pnpm --filter @buad/migrate bootstrap-owner you@example.com > owner.sql
cd apps/api && pnpm exec wrangler d1 execute buad-v2 --remote --file ../../owner.sql
```
المستخدمون الآخرون يدخلون برابط دعوة يصدره المدير (`POST /api/users/:id/invite`) أو بكلمة مرورهم القديمة بعد الترحيل.
