import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Card, EmptyState, Field, Input, Select } from "../../components/ui";
import { ago } from "../../lib/format";
import { auditQuery, teamUsersQuery } from "./queries";

const ENTITIES: Record<string, string> = {
  project: "المشاريع",
  client: "العملاء",
  document: "المستندات",
  company: "مالية الشركة",
  vat: "الضريبة",
  product: "المنتجات",
  request: "الطلبات",
  site: "الموقع",
  org: "المنشأة",
  user: "المستخدمون",
  role: "الأدوار",
  asset: "الملفات",
  import: "الاستيراد",
};
const time = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** «سجل النشاط»: who changed what and when. Read-only. */
export function ActivityPage() {
  const [entity, setEntity] = useState("");
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useQuery(auditQuery({ entity, user, from, to }));
  const users = useQuery(teamUsersQuery);
  return (
    <div className="space-y-4">
      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="القسم">
          <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">الكل</option>
            {Object.entries(ENTITIES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المستخدم">
          <Select value={user} onChange={(e) => setUser(e.target.value)}>
            <option value="">الكل</option>
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="من تاريخ">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="إلى تاريخ">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </Card>
      {q.data?.length === 0 && (
        <EmptyState title="لا نشاط مطابق" text="تظهر هنا التغييرات التي يجريها الفريق." />
      )}
      <ul className="space-y-2">
        {q.data?.map((i) => (
          <li key={i.id}>
            <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="font-medium">{i.summary}</p>
                <p className="text-xs text-muted">
                  {i.userName || "النظام"} · {time.format(new Date(i.at * 1000))} · {ago(i.at)}
                </p>
              </div>
              <Badge>{ENTITIES[i.entity] ?? i.entity}</Badge>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
