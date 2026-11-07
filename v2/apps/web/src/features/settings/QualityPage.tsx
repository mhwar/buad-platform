import { Badge, Card, PageHeader, type Tone } from "../../components/ui";

type Status = "done" | "partial" | "planned";
const STATUS: Record<Status, { label: string; tone: Tone }> = {
  done: { label: "منجز", tone: "green" },
  partial: { label: "جزئي", tone: "amber" },
  planned: { label: "مخطط", tone: "gray" },
};

/** Each item: what the platform promises, how it is held to it, and where it stands. */
const AREAS: {
  title: string;
  items: { what: string; how: string; status: Status }[];
}[] = [
  {
    title: "إتاحة الوصول",
    items: [
      {
        what: "بلا مخالفات WCAG 2.1 A/AA في الصفحات الرئيسية، بالوضعين الفاتح والداكن",
        how: "فحص آلي (axe-core) قبل كل نشر",
        status: "done",
      },
      {
        what: "رابط «تخطَّ إلى المحتوى»، وأسماء مقروءة للأزرار والأيقونات",
        how: "في إطار المنصة نفسه",
        status: "done",
      },
      {
        what: "تشغيل كامل بلوحة المفاتيح، والتركيز محبوس داخل النوافذ ويعود لمكانه",
        how: "مكوّن النافذة الموحد",
        status: "done",
      },
      {
        what: "اختبار مع مستخدمين وقارئات شاشة (NVDA وVoiceOver)",
        how: "جلسة يدوية",
        status: "planned",
      },
    ],
  },
  {
    title: "الجوال والأجهزة",
    items: [
      {
        what: "لا تمرير جانبي، ولا نص أصغر من 12 بكسل، ولا تواريخ بصيغة خام",
        how: "فحص آلي على 11 صفحة بحجم الجوال",
        status: "done",
      },
      {
        what: "الجداول تصير بطاقات معنونة على الجوال",
        how: "مكوّن الجدول الموحد؛ بعض القوائم لم تنتقل إليه بعد",
        status: "partial",
      },
      {
        what: "النوافذ تظهر ورقة سفلية، وشريط تنقل سفلي",
        how: "مكوّنات الإطار",
        status: "done",
      },
    ],
  },
  {
    title: "اتساق التصميم",
    items: [
      {
        what: "قواعد تصميم مكتوبة: أي مكوّن لأي حالة",
        how: "docs/DESIGN.md",
        status: "done",
      },
      {
        what: "ألوان الحالات من رموز موحّدة، لا ألوان مكتوبة يدوياً",
        how: "اختبار يرفض أي لون خام جديد",
        status: "done",
      },
      {
        what: "حالة الصفحة (التبويب، الفلاتر، الفترة) في الرابط",
        how: "في كل القوائم الرئيسية",
        status: "done",
      },
      {
        what: "سؤال «تجاهل التعديلات غير المحفوظة؟» قبل إغلاق نموذج معدّل",
        how: "نوافذ المشروع والقيد والعميل",
        status: "partial",
      },
    ],
  },
  {
    title: "البيانات والأمان",
    items: [
      {
        what: "سجل تدقيق لكل تعديل، ولكل تصدير وطباعة",
        how: "«سجل النشاط»",
        status: "done",
      },
      {
        what: "نسخة كاملة من قاعدة البيانات قبل كل نشر، تُحفظ 30 يوماً",
        how: "خطوة النشر الآلية",
        status: "done",
      },
      {
        what: "اختبار استعادة موثّق من النسخة الاحتياطية",
        how: "الخطوات مكتوبة في دليل المشروع؛ لم تُجرَّب على الإنتاج",
        status: "partial",
      },
      {
        what: "استعادة الدخول عند نسيان كلمة المرور دون تدخّل يدوي في قاعدة البيانات",
        how: "مفتاح استعادة يُنشأ من «حسابي»، يعمل مرة واحدة ويُحفظ مشفّراً",
        status: "done",
      },
      {
        what: "حدّ لمحاولات الدخول الخاطئة، وجلسة تنتهي بعد 12 ساعة",
        how: "في الخادم",
        status: "done",
      },
    ],
  },
];

/**
 * «الجودة والامتثال»: what the platform holds itself to and where each item stands, as on the
 * associations-council platform. The automated items are checked on every deploy.
 */
export function QualityPage() {
  const all = AREAS.flatMap((a) => a.items);
  const done = all.filter((i) => i.status === "done").length;
  return (
    <>
      <PageHeader
        title="الجودة والامتثال"
        subtitle={`${done} منجز من ${all.length}. البنود الآلية تُفحص قبل كل نشر، فلا يصل إلى المنصة ما يكسرها.`}
      />
      <div className="space-y-4">
        {AREAS.map((a) => (
          <Card key={a.title} className="p-0">
            <h2 className="px-5 pt-5 pb-3 font-semibold">{a.title}</h2>
            <ul className="divide-y border-t">
              {a.items.map((i) => (
                <li
                  key={i.what}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{i.what}</span>
                    <span className="block text-xs text-muted">{i.how}</span>
                  </span>
                  <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
