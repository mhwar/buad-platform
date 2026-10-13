import { formatCode, fromRiyals, normalizeName } from "@buad/domain";

/** v1 workspace shapes (app.html saveClient L5080, saveProject L5687, 100-day createClientFromOrg L14787). */
type Loose = Record<string, unknown>;

export interface ClientRow {
  id: string;
  code: string;
  name: string;
  nameNorm: string;
  type: string;
  email: string;
  phone: string;
  city: string;
  regNo: string;
  taxNo: string;
  address: string;
  website: string;
  notes: string;
  logo: string;
  createdAt: number | null;
}
export interface ContactRow {
  id: string;
  clientId: string;
  name: string;
  title: string;
  isSignatory: true;
}
export interface ProjectRow {
  id: string;
  clientId: string;
  number: string;
  name: string;
  type: string;
  status: string;
  ownerId: string;
  visibility: string;
  location: string;
  startDate: string;
  endDate: string;
  payDate: string;
  expectedValue: number;
  notes: string;
  createdAt: number | null;
}
export interface Issue {
  kind: "client" | "project";
  id: string;
  name: string;
  /** "rejected" rows are not imported; "fixed" rows are imported with the change described. */
  severity: "rejected" | "fixed";
  reason: string;
}
export interface Business {
  clients: ClientRow[];
  contacts: ContactRow[];
  projects: ProjectRow[];
  /** Highest number used per counter, so v2 continues after the imported ones. */
  counters: { kind: string; year: number; value: number }[];
  issues: Issue[];
}

const CLIENT_TYPES = new Set(["company", "association", "government", "individual", "other"]);
const PROJECT_TYPES = new Set(["training", "consulting", "event", "other"]);
const PROJECT_STATUSES = new Set(["draft", "active", "completed", "paused", "cancelled"]);
const MAX_LOGO_CHARS = 280_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const s = (v: unknown) =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
const date = (v: unknown) => (DATE.test(s(v)) ? s(v) : "");
const epoch = (v: unknown): number | null => {
  const d = date(v);
  return d ? Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000) : null;
};
const joinNotes = (...xs: unknown[]) => [...new Set(xs.map(s).filter(Boolean))].join("\n\n");
const riyals = (v: unknown) => {
  const n = Number.parseFloat(s(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
/** Stable creation order: by created date, then original position. */
const byCreated = <T extends { created: string; i: number }>(a: T, b: T) =>
  (a.created || "9999").localeCompare(b.created || "9999") || a.i - b.i;

export function planBusiness(ws: Loose): Business {
  const issues: Issue[] = [];
  const clients: ClientRow[] = [];
  const contacts: ContactRow[] = [];
  const projects: ProjectRow[] = [];

  const rawClients = (Array.isArray(ws.clients) ? (ws.clients as Loose[]) : [])
    .map((c, i) => ({ c, i, created: date(c.created) }))
    .sort(byCreated);
  const seenId = new Set<string>();
  const seenReg = new Map<string, string>();
  const seenTax = new Map<string, string>();

  for (const { c } of rawClients) {
    const id = s(c.id);
    const name = s(c.name);
    if (!id || seenId.has(id)) {
      issues.push({
        kind: "client",
        id: id || "—",
        name,
        severity: "rejected",
        reason: id ? "معرّف مكرر" : "بلا معرّف",
      });
      continue;
    }
    if (!name) {
      issues.push({ kind: "client", id, name: "", severity: "rejected", reason: "عميل بلا اسم" });
      continue;
    }
    seenId.add(id);
    let regNo = s(c.reg_no);
    let taxNo = s(c.tax_no);
    if (regNo && seenReg.has(regNo)) {
      issues.push({
        kind: "client",
        id,
        name,
        severity: "fixed",
        reason: `رقم السجل ${regNo} مكرر مع ${seenReg.get(regNo)}، أُفرغ لهذا العميل`,
      });
      regNo = "";
    }
    if (taxNo && seenTax.has(taxNo)) {
      issues.push({
        kind: "client",
        id,
        name,
        severity: "fixed",
        reason: `الرقم الضريبي ${taxNo} مكرر مع ${seenTax.get(taxNo)}، أُفرغ لهذا العميل`,
      });
      taxNo = "";
    }
    if (regNo) seenReg.set(regNo, name);
    if (taxNo) seenTax.set(taxNo, name);
    let type = s(c.type);
    if (!CLIENT_TYPES.has(type)) {
      if (type)
        issues.push({
          kind: "client",
          id,
          name,
          severity: "fixed",
          reason: `نوع غير معروف «${type}» صار «أخرى»`,
        });
      type = type ? "other" : "company";
    }
    let logo = s(c.logo);
    if (
      logo &&
      (logo.length > MAX_LOGO_CHARS || !/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(logo))
    ) {
      issues.push({
        kind: "client",
        id,
        name,
        severity: "fixed",
        reason: "الشعار كبير أو بصيغة غير مدعومة، لم يُنقل",
      });
      logo = "";
    }
    clients.push({
      id,
      code: formatCode("CL", clients.length + 1),
      name,
      nameNorm: normalizeName(name),
      type,
      email: s(c.email).toLowerCase(),
      phone: s(c.phone),
      city: s(c.city),
      regNo,
      taxNo,
      address: s(c.address),
      website: s(c.website),
      // the 100-day path wrote `note` instead of `notes`
      notes: joinNotes(c.notes, c.note),
      logo,
      createdAt: epoch(c.created),
    });
    // the 100-day path wrote `contact` instead of `contact_name`
    const signatory = s(c.contact_name) || s(c.contact);
    const title = s(c.contact_title);
    if (signatory || title)
      contacts.push({ id: `con_${id}`, clientId: id, name: signatory, title, isSignatory: true });
  }

  const fin = (ws.fin && typeof ws.fin === "object" ? ws.fin : {}) as Record<string, Loose>;
  const rawProjects = (Array.isArray(ws.projects) ? (ws.projects as Loose[]) : [])
    .map((p, i) => ({ p, i, created: date(p.created) || date(p.start_date) }))
    .sort(byCreated);
  const perYear = new Map<number, number>();
  const seenProject = new Set<string>();
  const thisYear = new Date().getUTCFullYear();

  for (const { p, created } of rawProjects) {
    const id = s(p.id);
    const name = s(p.name);
    const clientId = s(p.client_id);
    if (!id || seenProject.has(id)) {
      issues.push({
        kind: "project",
        id: id || "—",
        name,
        severity: "rejected",
        reason: id ? "معرّف مكرر" : "بلا معرّف",
      });
      continue;
    }
    if (!name) {
      issues.push({ kind: "project", id, name: "", severity: "rejected", reason: "مشروع بلا اسم" });
      continue;
    }
    if (!seenId.has(clientId)) {
      issues.push({
        kind: "project",
        id,
        name,
        severity: "rejected",
        reason: `العميل ${clientId || "—"} غير موجود (مشروع يتيم)`,
      });
      continue;
    }
    seenProject.add(id);
    const year = created ? Number(created.slice(0, 4)) : thisYear;
    const seq = (perYear.get(year) ?? 0) + 1;
    perYear.set(year, seq);
    let type = s(p.type);
    if (!PROJECT_TYPES.has(type)) type = "other";
    let status = s(p.status);
    if (!PROJECT_STATUSES.has(status)) {
      if (status)
        issues.push({
          kind: "project",
          id,
          name,
          severity: "fixed",
          reason: `حالة غير معروفة «${status}» صارت «جاري التنفيذ»`,
        });
      status = "active";
    }
    const startDate = date(p.start_date);
    let endDate = date(p.end_date);
    if (startDate && endDate && endDate < startDate) {
      issues.push({
        kind: "project",
        id,
        name,
        severity: "fixed",
        reason: "تاريخ الانتهاء قبل البداية، أُفرغ تاريخ الانتهاء",
      });
      endDate = "";
    }
    const ctrl = (fin[id]?.ctrl ?? {}) as Loose;
    projects.push({
      id,
      clientId,
      number: formatCode("PRJ", seq, year),
      name,
      type,
      status,
      ownerId: s(p.owner_id),
      visibility: s(p.visibility) === "private" ? "private" : "team",
      location: s(p.location),
      startDate,
      endDate,
      payDate: date(p.pay_date),
      expectedValue: fromRiyals(riyals(ctrl.contract_value) || riyals(p._initial_contract_val)),
      notes: joinNotes(p.notes, p.note),
      createdAt: epoch(created),
    });
  }

  const counters = [
    { kind: "client", year: 0, value: clients.length },
    ...[...perYear].map(([year, value]) => ({ kind: "project", year, value })),
  ].filter((c) => c.value > 0);

  return { clients, contacts, projects, counters, issues };
}
