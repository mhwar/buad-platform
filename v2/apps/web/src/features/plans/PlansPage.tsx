import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  confirmAction,
  EmptyState,
  Segmented,
  Select,
} from "../../components/ui";
import { useCan } from "../../session";
import { TaskDialog } from "../tasks/TaskDialogs";
import { send } from "../team/queries";
import {
  CycleDialog,
  IdentityDialog,
  IndicatorDialog,
  InitiativeDialog,
  ObjectiveDialog,
  ReviewDialog,
} from "./dialogs";
import { ObjectiveCard, ProgressBar, StatusBadge } from "./ObjectiveCard";
import {
  type Cycle,
  cycleQuery,
  cyclesQuery,
  type Indicator,
  type Initiative,
  type Objective,
  ownersQuery,
} from "./queries";
import { FollowUp, TargetPanel, TemplateDialog } from "./Tracking";

type Modal =
  | { t: "cycle" }
  | { t: "identity" }
  | { t: "objective"; o?: Objective }
  | { t: "indicator"; objective: string; i?: Indicator }
  | { t: "initiative"; objective: string; i?: Initiative }
  | { t: "review"; o: Objective }
  | { t: "template" }
  | { t: "task"; initiative: Initiative };

const STATUS: Record<Cycle["status"], string> = {
  draft: "مسودة",
  active: "جارية",
  closed: "مغلقة",
};

/** «الخطط»: the strategic plan and the operational plan that carries it out. */
export function PlansPage() {
  const can = useCan();
  const edit = can("plans.edit");
  const qc = useQueryClient();
  const [kind, setKind] = useState<"strategic" | "operational">("operational");
  const cycles = useQuery(cyclesQuery);
  const owners = useQuery(ownersQuery);
  const mine = cycles.data?.filter((c) => c.kind === kind) ?? [];
  const strategic = cycles.data?.filter((c) => c.kind === "strategic") ?? [];
  const [picked, setPicked] = useState("");
  const [quarter, setQuarter] = useState<"all" | "1" | "2" | "3" | "4">("all");
  const [modal, setModal] = useState<Modal | null>(null);
  const [view, setView] = useState<"goals" | "follow">("goals");
  const cycleId =
    mine.find((c) => c.id === picked)?.id ??
    mine.find((c) => c.status === "active")?.id ??
    mine[0]?.id ??
    "";
  const data = useQuery(cycleQuery(cycleId));
  const parentId = data.data?.cycle.parentCycleId ?? "";
  const parent = useQuery(cycleQuery(parentId));

  useEffect(() => setQuarter("all"), [cycleId]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["plan-cycles"] });
    qc.invalidateQueries({ queryKey: ["plan-cycle"] });
  };
  const done = () => {
    setModal(null);
    refresh();
  };
  const ownerName = (id: string) =>
    owners.data?.find((o) => o.id === id)?.name ||
    owners.data?.find((o) => o.id === id)?.email ||
    "";
  const d = data.data;
  const objectives = (d?.objectives ?? []).filter(
    (o) => quarter === "all" || o.quarter === Number(quarter),
  );
  const parentObjs = parent.data?.objectives ?? [];
  // The headline money target: the plan's own revenue indicator, or the strategic plan's.
  const isRevenue = (i: Indicator) => i.source === "platform:revenue";
  const yearly = (x?: typeof d) =>
    x?.objectives
      .filter((o) => o.quarter === 0)
      .flatMap((o) => o.indicators)
      .find(isRevenue);
  const headline = yearly(d) ?? (kind === "operational" ? yearly(parent.data) : undefined);
  const quarterTargets = (d?.objectives ?? [])
    .filter((o) => o.quarter > 0)
    .flatMap((o) =>
      o.indicators
        .filter(isRevenue)
        .map((i) => ({ quarter: o.quarter, target: i.target, current: i.current })),
    )
    .sort((a, b) => a.quarter - b.quarter);
  const remove = async (o: Objective) => {
    if (
      !(await confirmAction({
        title: `حذف الهدف «${o.title}»؟`,
        text: "تُحذف معه مؤشراته ومبادراته.",
        action: "حذف الهدف",
        danger: true,
      }))
    )
      return;
    await send("DELETE", `/api/plans/objectives/${o.id}`);
    refresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="نوع الخطة"
          value={kind}
          onChange={setKind}
          items={[
            { value: "strategic", label: "الخطة الاستراتيجية" },
            { value: "operational", label: "الخطة التشغيلية" },
          ]}
        />
        <div className="flex items-center gap-2">
          {mine.length > 1 && (
            <Select
              aria-label="الخطة"
              value={cycleId}
              onChange={(e) => setPicked(e.target.value)}
              className="min-w-44"
            >
              {mine.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          {edit && (
            <Button variant="secondary" onClick={() => setModal({ t: "template" })}>
              <Sparkles className="size-4" />
              خطة جاهزة
            </Button>
          )}
          {edit && mine.length > 0 && (
            <Button variant="secondary" onClick={() => setModal({ t: "cycle" })}>
              <Plus className="size-4" />
              خطة جديدة
            </Button>
          )}
        </div>
      </div>

      {cycles.isSuccess && mine.length === 0 && (
        <EmptyState
          title={kind === "strategic" ? "لا توجد خطة استراتيجية بعد" : "لا توجد خطة تشغيلية بعد"}
          text={
            kind === "strategic"
              ? "ابدأ بالرؤية والرسالة والقيم، ثم أضف أهدافاً لها مؤشرات ومستهدفات."
              : "اجعل السنة أربعة أرباع، واربط أهدافها بالخطة الاستراتيجية."
          }
          action={
            edit ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setModal({ t: "template" })}>
                  <Sparkles className="size-4" />
                  أنشئ خطة السنة الأولى
                </Button>
                <Button variant="secondary" onClick={() => setModal({ t: "cycle" })}>
                  خطة فارغة
                </Button>
              </div>
            ) : undefined
          }
        />
      )}

      {d && (
        <>
          <Card className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{d.cycle.name}</h2>
                <p className="text-xs text-muted">
                  {d.cycle.startDate} → {d.cycle.endDate} · <Badge>{STATUS[d.cycle.status]}</Badge>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={d.status} />
                {edit && (
                  <Button variant="secondary" onClick={() => setModal({ t: "identity" })}>
                    <Pencil className="size-4" />
                    تعديل الخطة
                  </Button>
                )}
              </div>
            </div>
            <ProgressBar value={d.progress} label="تقدّم الخطة" />
            {kind === "strategic" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-muted">الرؤية</p>
                  <p className="text-sm">{d.cycle.vision || "لم تُكتب بعد."}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">الرسالة</p>
                  <p className="text-sm">{d.cycle.mission || "لم تُكتب بعد."}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="mb-1 text-xs font-semibold text-muted">القيم</p>
                  {d.cycle.values.length ? (
                    <div className="flex flex-wrap gap-2">
                      {d.cycle.values.map((v) => (
                        <Badge key={v} tone="blue">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm">لم تُحدَّد بعد.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">
                إجمالي ميزانيات الأهداف:{" "}
                <b>{new Intl.NumberFormat("ar-SA-u-nu-latn").format(d.budget)}</b> ر.س
                {parent.data ? ` · تخدم: ${parent.data.cycle.name}` : ""}
              </p>
            )}
          </Card>

          {headline && (
            <TargetPanel
              indicator={headline}
              quarters={kind === "operational" ? quarterTargets : undefined}
            />
          )}

          <Segmented
            label="طريقة العرض"
            value={view}
            onChange={setView}
            items={[
              { value: "goals", label: "الأهداف" },
              { value: "follow", label: "المتابعة" },
            ]}
          />

          {view === "follow" && <FollowUp d={d} />}

          {view === "goals" && kind === "operational" && (
            <Segmented
              label="الربع"
              value={quarter}
              onChange={setQuarter}
              items={[
                { value: "all", label: "كل السنة" },
                { value: "1", label: "الربع 1" },
                { value: "2", label: "الربع 2" },
                { value: "3", label: "الربع 3" },
                { value: "4", label: "الربع 4" },
              ]}
            />
          )}

          {view === "goals" && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">
                  {kind === "strategic" ? "الأهداف الاستراتيجية" : "الأهداف التشغيلية"}
                </h2>
                {edit && (
                  <Button onClick={() => setModal({ t: "objective" })}>
                    <Plus className="size-4" />
                    هدف
                  </Button>
                )}
              </div>
              {objectives.length === 0 && (
                <EmptyState
                  title="لا أهداف هنا بعد"
                  text="أضف هدفاً ثم مؤشراً ومبادرة ليظهر التقدّم."
                />
              )}
              <div className="grid gap-4 xl:grid-cols-2">
                {objectives.map((o) => (
                  <ObjectiveCard
                    key={o.id}
                    o={o}
                    canEdit={edit}
                    ownerName={ownerName(o.ownerId)}
                    parentTitle={parentObjs.find((p) => p.id === o.parentId)?.title}
                    onEdit={() => setModal({ t: "objective", o })}
                    onDelete={() => remove(o)}
                    onAddIndicator={() => setModal({ t: "indicator", objective: o.id })}
                    onEditIndicator={(i) => setModal({ t: "indicator", objective: o.id, i })}
                    onAddInitiative={() => setModal({ t: "initiative", objective: o.id })}
                    onEditInitiative={(i) => setModal({ t: "initiative", objective: o.id, i })}
                    onReview={() => setModal({ t: "review", o })}
                    onChanged={refresh}
                    onAddTask={
                      can("tasks.edit")
                        ? (initiative) => setModal({ t: "task", initiative })
                        : undefined
                    }
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {modal?.t === "cycle" && (
        <CycleDialog
          kind={kind}
          strategic={strategic}
          onClose={() => setModal(null)}
          onSaved={done}
        />
      )}
      {modal?.t === "identity" && d && (
        <IdentityDialog cycle={d.cycle} onClose={() => setModal(null)} onSaved={done} />
      )}
      {modal?.t === "objective" && d && (
        <ObjectiveDialog
          cycle={d.cycle}
          existing={modal.o}
          strategicObjectives={parentObjs.map((p) => ({ id: p.id, title: p.title }))}
          onClose={() => setModal(null)}
          onSaved={done}
        />
      )}
      {modal?.t === "indicator" && (
        <IndicatorDialog
          objectiveId={modal.objective}
          existing={modal.i}
          onClose={() => setModal(null)}
          onSaved={done}
        />
      )}
      {modal?.t === "initiative" && (
        <InitiativeDialog
          objectiveId={modal.objective}
          existing={modal.i}
          onClose={() => setModal(null)}
          onSaved={done}
        />
      )}
      {modal?.t === "template" && (
        <TemplateDialog
          onClose={() => setModal(null)}
          onCreated={() => {
            done();
            setKind("strategic");
          }}
        />
      )}
      {modal?.t === "task" && (
        <TaskDialog
          initiativeId={modal.initiative.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            done();
            qc.invalidateQueries({ queryKey: ["tasks"] });
          }}
        />
      )}
      {modal?.t === "review" && (
        <ReviewDialog objective={modal.o} onClose={() => setModal(null)} onSaved={done} />
      )}
    </div>
  );
}
