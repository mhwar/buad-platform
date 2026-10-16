/* ─────────────────────────────────────────────────────────────────────────────
 * Ready-made plans: a strategic plan and the operational plan that serves it, created together
 * by the owner from «التخطيط». Plain data; the API turns it into cycles, objectives, indicators
 * and initiatives for the chosen year. Budgets are left empty for the owner to fill.
 * ──────────────────────────────────────────────────────────────────────────── */

export type TemplateIndicator = {
  name: string;
  unit: string;
  target: number;
  baseline?: number;
  /** "manual" or "platform:<metric>". */
  source: string;
  direction?: "up" | "down";
};
export type TemplateInitiative = {
  title: string;
  /** Quarter it runs in (1–4): its dates are that quarter of the plan's year. */
  quarter: 1 | 2 | 3 | 4;
};
export type TemplateObjective = {
  key: string;
  title: string;
  description?: string;
  weight?: number;
  /** Operational objectives: the quarter it belongs to (0 = the whole year). */
  quarter?: 0 | 1 | 2 | 3 | 4;
  /** Operational objectives: the strategic objective it serves. */
  serves?: string;
  indicators: TemplateIndicator[];
  initiatives?: TemplateInitiative[];
};
export type PlanTemplate = {
  key: string;
  name: string;
  description: string;
  strategic: {
    name: (year: number) => string;
    vision: string;
    mission: string;
    values: string[];
    objectives: TemplateObjective[];
  };
  operational: { name: (year: number) => string; objectives: TemplateObjective[] };
};

const revenue = (target: number): TemplateIndicator => ({
  name: "الإيرادات المحصّلة",
  unit: "ر.س",
  target,
  source: "platform:revenue",
});

/** Year one: 2,000,000 SAR, the services launched, the platform's first release tried by 3 associations. */
export const YEAR_ONE: PlanTemplate = {
  key: "year-one",
  name: "خطة السنة الأولى",
  description:
    "إيرادات 2,000,000 ر.س، إطلاق المنتجات، وإصدار النسخة الأولية من المنصة وتجربتها على 3 جمعيات — استراتيجية وتشغيلية مرتبطتان.",
  strategic: {
    name: (y) => `الخطة الاستراتيجية — السنة الأولى ${y}`,
    vision: "أن نكون الشريك التنفيذي الأول للقطاع غير الربحي في المملكة.",
    mission:
      "نحوّل أهداف الجهات إلى مشاريع منفّذة بأثر موثّق، عبر خدمات متكاملة ومنصة تدير التنفيذ بشفافية.",
    values: ["المسؤولية", "الوضوح", "الجودة", "الأثر", "الشراكة"],
    objectives: [
      {
        key: "s1",
        title: "تحقيق إيرادات 2,000,000 ر.س",
        description: "نمو مستدام من العقود المحصّلة والخدمات، بتوزيع ربعي متصاعد.",
        weight: 3,
        indicators: [
          revenue(2_000_000),
          {
            name: "قيمة العقود الجديدة",
            unit: "ر.س",
            target: 2_400_000,
            source: "platform:contracts",
          },
          { name: "نسبة تحويل الطلبات", unit: "%", target: 30, source: "platform:conversion" },
          { name: "متوسط قيمة المشروع", unit: "ر.س", target: 150_000, source: "manual" },
        ],
      },
      {
        key: "s2",
        title: "إطلاق منتجاتنا وخدماتنا في السوق",
        description: "صفحات واضحة لكل خدمة، وتدفّق طلبات منتظم من الموقع والعلاقات.",
        weight: 2,
        indicators: [
          {
            name: "المنتجات المنشورة في الموقع",
            unit: "منتج",
            target: 6,
            source: "platform:products_published",
          },
          { name: "طلبات العروض الواردة", unit: "طلب", target: 120, source: "platform:requests" },
          { name: "مشاريع بدأت", unit: "مشروع", target: 15, source: "platform:projects_started" },
        ],
      },
      {
        key: "s3",
        title: "إصدار النسخة الأولية من المنصة وتجربتها على 3 جمعيات",
        description: "تجربة حقيقية تثبت القيمة وتبني النسخة 1.0 من ملاحظات المستخدمين.",
        weight: 2,
        indicators: [
          { name: "جمعيات تجريبية مفعّلة", unit: "جمعية", target: 3, source: "manual" },
          { name: "رضا المستخدمين (من 10)", unit: "/10", target: 8, source: "manual" },
          { name: "مستخدمون نشطون أسبوعياً", unit: "مستخدم", target: 20, source: "manual" },
          {
            name: "أعطال حرجة مفتوحة",
            unit: "عطل",
            target: 0,
            baseline: 5,
            source: "manual",
            direction: "down",
          },
        ],
      },
      {
        key: "s4",
        title: "بناء السمعة والثقة",
        description: "عملاء جدد، وقصص نجاح موثّقة تتحدث عنّا.",
        weight: 1,
        indicators: [
          { name: "عملاء جدد", unit: "عميل", target: 12, source: "platform:clients_new" },
          { name: "قصص نجاح منشورة", unit: "قصة", target: 6, source: "manual" },
        ],
      },
      {
        key: "s5",
        title: "جاهزية تشغيلية وكفاءة",
        description: "تسليم في الموعد، وهامش صحي، وتحصيل منتظم.",
        weight: 1,
        indicators: [
          { name: "التسليم في الموعد", unit: "%", target: 90, source: "manual" },
          { name: "هامش الربح", unit: "%", target: 30, source: "manual" },
          {
            name: "متوسط أيام التحصيل",
            unit: "يوم",
            target: 45,
            baseline: 90,
            source: "manual",
            direction: "down",
          },
        ],
      },
    ],
  },
  operational: {
    name: (y) => `الخطة التشغيلية — ${y}`,
    objectives: [
      {
        key: "q1",
        title: "الربع الأول: الإطلاق",
        quarter: 1,
        serves: "s2",
        indicators: [revenue(250_000)],
        initiatives: [
          { title: "نشر الموقع الجديد وصفحات المنتجات الست", quarter: 1 },
          { title: "اعتماد مسار المبيعات والمتابعة في المنصة للفريق", quarter: 1 },
          { title: "اختيار 3 جمعيات تجريبية وتوقيع مذكرات التجربة", quarter: 1 },
          { title: "تجهيز النسخة الأولية: الإعداد والأدوار واستيراد البيانات", quarter: 1 },
        ],
      },
      {
        key: "q2",
        title: "الربع الثاني: التجربة مع الجمعيات",
        quarter: 2,
        serves: "s3",
        indicators: [revenue(400_000)],
        initiatives: [
          { title: "تهيئة الجمعيات الثلاث وتدريب فرقها", quarter: 2 },
          { title: "تشغيل مشاريع الجمعيات التجريبية على المنصة", quarter: 2 },
          { title: "اجتماع ملاحظات كل أسبوعين مع كل جمعية", quarter: 2 },
          { title: "نشر أول 3 قصص نجاح", quarter: 2 },
          { title: "حملة تعريفية: فعاليات القطاع وLinkedIn", quarter: 2 },
        ],
      },
      {
        key: "q3",
        title: "الربع الثالث: الإصدار 1.0",
        quarter: 3,
        serves: "s1",
        indicators: [revenue(600_000)],
        initiatives: [
          { title: "إصدار النسخة 1.0 من ملاحظات التجربة", quarter: 3 },
          { title: "تصميم باقات اشتراك المنصة وتسعيرها", quarter: 3 },
          { title: "شراكات مع جهات مانحة لتمويل التنفيذ", quarter: 3 },
          { title: "توسيع الفريق التنفيذي بحسب الطلب", quarter: 3 },
        ],
      },
      {
        key: "q4",
        title: "الربع الرابع: التوسّع",
        quarter: 4,
        serves: "s1",
        indicators: [revenue(750_000)],
        initiatives: [
          { title: "استهداف 10 جمعيات جديدة للخدمات والمنصة", quarter: 4 },
          { title: "مراجعة سنوية للأداء وإعداد خطة السنة الثانية", quarter: 4 },
        ],
      },
      {
        key: "y",
        title: "طوال السنة: سمعة وتشغيل",
        quarter: 0,
        serves: "s4",
        indicators: [
          { name: "عملاء جدد", unit: "عميل", target: 12, source: "platform:clients_new" },
          {
            name: "جمعيات لها مشروع نشط",
            unit: "جمعية",
            target: 8,
            source: "platform:associations_active",
          },
        ],
        initiatives: [],
      },
    ],
  },
};

export const PLAN_TEMPLATES: PlanTemplate[] = [YEAR_ONE];
export const planTemplateByKey = (k: string) => PLAN_TEMPLATES.find((t) => t.key === k);
