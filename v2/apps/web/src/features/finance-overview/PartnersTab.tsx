import { RETAINED_LABELS } from "@buad/schema/company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PieChart, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  confirmAction,
  Dialog,
  DialogActions,
  Field,
  Input,
  Notice,
  Select,
  toast,
} from "../../components/ui";
import { day, fromEpoch, sar } from "../../lib/format";
import {
  companyApi,
  companyKeys,
  companyOverviewQuery,
  type Distribution,
  distributionsQuery,
  type Partner,
  type Preview,
  partnersQuery,
} from "./company-api";

/** «الشركاء والتوزيع»: who owns what, and every profit distribution (draft → completed). */
export function PartnersTab() {
  const [wizard, setWizard] = useState(false);
  return (
    <div className="space-y-6">
      <PartnersCard />
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <PieChart className="size-4" /> توزيعات الأرباح
          </h2>
          <Button onClick={() => setWizard(true)}>
            <Plus className="size-4" /> توزيع ربح مشروع
          </Button>
        </div>
        <Distributions />
      </Card>
      {wizard && <DistributionWizard onClose={() => setWizard(false)} />}
    </div>
  );
}

function PartnersCard() {
  const q = useQuery(partnersQuery);
  const [editing, setEditing] = useState<Partner | "new" | null>(null);
  const total = q.data?.totalPct ?? 0;
  const okPct = Math.abs(total - 100) < 0.01;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="size-4" /> الشركاء
        </h2>
        <Button variant="secondary" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> شريك
        </Button>
      </div>
      {(q.data?.items.length ?? 0) === 0 ? (
        <p className="py-6 text-center text-sm text-muted">لا شركاء بعد. أضيفوا الشركاء وحصصهم.</p>
      ) : (
        <>
          <ul className="divide-y rounded-lg border text-sm">
            {q.data?.items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-right hover:bg-brand-soft/50"
                >
                  <span>
                    {p.name}
                    {p.note && <span className="block text-xs text-muted">{p.note}</span>}
                  </span>
                  <b>{p.sharePct}%</b>
                </button>
              </li>
            ))}
          </ul>
          <p
            className={`mt-2 text-sm ${okPct ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
          >
            مجموع الحصص: {total.toFixed(2)}% {okPct ? "✓" : "— يجب أن يكون 100%"}
          </p>
        </>
      )}
      {editing && (
        <PartnerDialog
          partner={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function PartnerDialog({ partner, onClose }: { partner: Partner | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(partner?.name ?? "");
  const [pct, setPct] = useState(partner ? String(partner.sharePct) : "");
  const [note, setNote] = useState(partner?.note ?? "");
  const [err, setErr] = useState("");
  const done = async () => {
    await qc.invalidateQueries({ queryKey: companyKeys.all });
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={partner ? "تعديل شريك" : "إضافة شريك"}
      footer={
        <DialogActions
          onCancel={onClose}
          aside={
            partner && (
              <Button
                variant="secondary"
                onClick={async () => {
                  if (
                    !(await confirmAction({
                      title: `حذف الشريك «${partner.name}»؟`,
                      action: "حذف الشريك",
                      danger: true,
                    }))
                  )
                    return;
                  await companyApi.removePartner(partner.id);
                  await done();
                }}
              >
                <Trash2 className="size-4" /> حذف
              </Button>
            )
          }
        >
          <Button
            onClick={async () => {
              const body = { name: name.trim(), sharePct: Number(pct), note };
              if (!body.name || !(body.sharePct > 0) || body.sharePct > 100)
                return setErr("أدخلوا الاسم وحصة بين 0 و100");
              try {
                if (partner) await companyApi.updatePartner(partner.id, body);
                else await companyApi.addPartner(body);
                await done();
              } catch (x) {
                const b = (x as { body?: { error?: string; total?: number } }).body;
                setErr(
                  b?.error === "shares_over_100"
                    ? `مجموع الحصص سيصبح ${Math.round((b.total ?? 0) * 100) / 100}%، والحد 100%. عدّلوا حصة شريك آخر أو احذفوا المكرر أولاً.`
                    : "تعذّر الحفظ",
                );
              }
            }}
          >
            حفظ
          </Button>
        </DialogActions>
      }
    >
      {err && <Notice>{err}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الاسم">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="الحصة %">
          <Input
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
        </Field>
        <Field label="ملاحظة" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted">
        التوزيعات السابقة تحتفظ بالاسم والحصة كما كانت وقت اعتمادها.
      </p>
    </Dialog>
  );
}

function Distributions() {
  const q = useQuery(distributionsQuery);
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: companyKeys.all });
  if (q.isPending)
    return <div className="m-5 h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />;
  const items = q.data ?? [];
  if (!items.length)
    return <p className="px-5 py-10 text-center text-sm text-muted">لم يُسجَّل أي توزيع بعد.</p>;
  return (
    <ul className="mt-4 divide-y border-t">
      {items.map((d) => (
        <li key={d.id} className="px-5 py-3">
          <button
            type="button"
            onClick={() => setOpen(open === d.id ? null : d.id)}
            className="flex w-full flex-wrap items-center justify-between gap-3 text-right"
          >
            <span>
              <span className="font-medium">{d.periodLabel || "توزيع"}</span>
              <span className="block text-xs text-muted">
                {d.status === "completed"
                  ? `اعتُمد ${fromEpoch(d.completedAt)}`
                  : `مسودة · ${fromEpoch(d.createdAt)}`}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span className="text-sm">
                وُزّع <b>{sar(d.distributed)}</b>
                {d.retained > 0 && (
                  <span className="text-muted">
                    {" "}
                    · محتجز {sar(d.retained)} ({RETAINED_LABELS[d.retainedCategory ?? "reserve"]})
                  </span>
                )}
              </span>
              <Badge tone={d.status === "completed" ? "green" : "amber"}>
                {d.status === "completed" ? "معتمد" : "مسودة"}
              </Badge>
            </span>
          </button>
          {open === d.id && <DistributionDetail d={d} onChanged={refresh} />}
        </li>
      ))}
    </ul>
  );
}

function DistributionDetail({ d, onChanged }: { d: Distribution; onChanged: () => void }) {
  return (
    <div className="mt-3 rounded-lg border bg-canvas p-3 text-sm">
      <p className="mb-2 text-xs text-muted">
        {d.from && d.to ? `${day(d.from)} — ${day(d.to)} · ` : ""}صافي الربح المتاح{" "}
        {sar(d.netProfit)} · نسبة التوزيع {d.pct}%
      </p>
      <ul className="space-y-1">
        {d.shares.map((s) => (
          <li key={`${s.partnerId}-${s.partnerName}`} className="flex justify-between">
            <span>
              {s.partnerName} <span className="text-muted">({s.sharePct}%)</span>
            </span>
            <b>{sar(s.amount)}</b>
          </li>
        ))}
      </ul>
      {d.status === "draft" && (
        <div className="mt-3 flex gap-2">
          <Button
            onClick={async () => {
              if (
                !(await confirmAction({
                  title: "اعتماد التوزيع؟",
                  text: "بعد الاعتماد لا يمكن تعديله أو حذفه، ويُخصم من المتاح.",
                  action: "اعتماد التوزيع",
                }))
              )
                return;
              try {
                await companyApi.completeDistribution(d.id);
                onChanged();
              } catch (x) {
                const code = (x as { body?: { error?: string } }).body?.error;
                toast(
                  code === "shares_not_100"
                    ? "مجموع حصص الشركاء ليس 100%؛ صحّحوا الحصص أولاً."
                    : "تعذّر اعتماد التوزيع",
                  "error",
                );
              }
            }}
          >
            <CheckCircle2 className="size-4" /> اعتماد
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              if (
                !(await confirmAction({ title: "حذف هذه المسودة؟", action: "حذف", danger: true }))
              )
                return;
              await companyApi.removeDistribution(d.id);
              onChanged();
            }}
          >
            <Trash2 className="size-4" /> حذف المسودة
          </Button>
        </div>
      )}
    </div>
  );
}

/** v1 «توزيع جديد»: 1) period and projects (or one project), 2) percent → shares and what is kept. */
export function DistributionWizard({
  onClose,
  preset,
}: {
  onClose: () => void;
  /** From «توزيع الربع»: distribute this quarter's chosen projects (skips step 1). */
  preset?: { year: number; q: number; projectIds: string[]; label: string };
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(preset ? 2 : 1);
  const mode: "quarter" | "project" = preset ? "quarter" : "project";
  const [projectId, setProjectId] = useState("");
  const [pct, setPct] = useState(100);
  const [retainedCategory, setRetained] = useState<"ops" | "dev" | "reserve">("reserve");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState("");
  const o = useQuery(companyOverviewQuery({}));
  const earning = (o.data?.projects ?? []).filter((p) => p.earning);

  const input = {
    mode,
    periodType: "project" as const,
    ...(preset ? { year: preset.year, q: preset.q } : {}),
    label: preset?.label ?? "",
    projectIds: preset?.projectIds ?? [],
    projectId,
    pct,
    retainedCategory,
  };
  const key = JSON.stringify(input);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` captures every input
  useEffect(() => {
    if (step !== 2) return;
    const t = setTimeout(() => {
      companyApi
        .preview(input)
        .then(setPreview)
        .catch(() => setErr("تعذّر الحساب"));
    }, 200);
    return () => clearTimeout(t);
  }, [key, step]);

  const save = async (status: "draft" | "completed") => {
    if (
      status === "completed" &&
      !(await confirmAction({
        title: "اعتماد التوزيع؟",
        text: "لا يمكن تعديله أو حذفه بعد الاعتماد.",
        action: "اعتماد التوزيع",
      }))
    )
      return;
    try {
      await companyApi.saveDistribution({ ...input, status });
      await qc.invalidateQueries({ queryKey: companyKeys.all });
      onClose();
    } catch (x) {
      const code = (x as { body?: { error?: string } }).body?.error;
      setErr(
        code === "nothing_to_distribute"
          ? "لا يوجد ربح متاح للتوزيع"
          : code === "shares_not_100"
            ? "مجموع حصص الشركاء ليس 100%؛ صحّحوا الحصص قبل اعتماد التوزيع (يمكن حفظه مسودة)."
            : "تعذّر الحفظ",
      );
    }
  };

  return (
    <Dialog
      open
      wide
      onOpenChange={(v) => !v && onClose()}
      title={`توزيع أرباح · الخطوة ${step} من 2`}
      footer={
        step === 1 ? (
          <DialogActions onCancel={onClose}>
            <Button disabled={mode === "project" && !projectId} onClick={() => setStep(2)}>
              التالي
            </Button>
          </DialogActions>
        ) : (
          <DialogActions
            onCancel={onClose}
            aside={
              <Button variant="secondary" onClick={() => setStep(1)}>
                السابق
              </Button>
            }
          >
            <Button disabled={!preview || preview.netProfit <= 0} onClick={() => save("completed")}>
              اعتماد التوزيع
            </Button>
            <Button
              variant="secondary"
              disabled={!preview || preview.netProfit <= 0}
              onClick={() => save("draft")}
            >
              حفظ كمسودة
            </Button>
          </DialogActions>
        )
      }
    >
      {err && <Notice>{err}</Notice>}
      {step === 1 ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            لتوزيع أرباح ربع كامل استخدموا تبويب «توزيع الربع». هنا توزيع ما تحقق من ربح مشروع واحد
            ولم يُوزَّع بعد.
          </p>
          <Field label="المشروع">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">اختاروا المشروع…</option>
              {earning.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — ربح {sar(p.profit)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نسبة التوزيع %">
              <Input
                type="number"
                dir="ltr"
                min={0}
                max={100}
                value={pct}
                onChange={(e) => setPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              />
            </Field>
            <Field label="الباقي يُحتجز لـ">
              <Select
                value={retainedCategory}
                onChange={(e) => setRetained(e.target.value as "ops")}
              >
                <option value="reserve">احتياطي</option>
                <option value="ops">تشغيل</option>
                <option value="dev">تطوير</option>
              </Select>
            </Field>
          </div>
          {!preview ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ) : (
            <div className="rounded-lg border p-3 text-sm">
              <p className="mb-2 font-semibold">{preview.label}</p>
              <ul className="space-y-1">
                <li className="flex justify-between">
                  <span>صافي الربح المتاح</span>
                  <b>{sar(preview.netProfit)}</b>
                </li>
                <li className="flex justify-between">
                  <span>يوزَّع ({pct}%)</span>
                  <b>{sar(preview.distributed)}</b>
                </li>
                <li className="flex justify-between text-muted">
                  <span>يُحتجز ({RETAINED_LABELS[retainedCategory]})</span>
                  <span>{sar(preview.retained)}</span>
                </li>
              </ul>
              <p className="mt-3 mb-1 text-xs font-semibold text-muted">حصص الشركاء</p>
              {preview.shares.length === 0 ? (
                <p className="text-xs text-red-600">أضيفوا الشركاء أولاً.</p>
              ) : (
                <ul className="space-y-1">
                  {preview.shares.map((s) => (
                    <li key={s.partnerId} className="flex justify-between">
                      <span>
                        {s.partnerName} <span className="text-muted">({s.sharePct}%)</span>
                      </span>
                      <b>{sar(s.amount)}</b>
                    </li>
                  ))}
                </ul>
              )}
              {Math.abs(preview.sharesPct - 100) > 0.01 && preview.shares.length > 0 && (
                <p className="mt-2 text-xs text-red-600">
                  مجموع حصص الشركاء {preview.sharesPct.toFixed(2)}% وليس 100%.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
