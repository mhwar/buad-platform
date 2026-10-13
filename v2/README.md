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
