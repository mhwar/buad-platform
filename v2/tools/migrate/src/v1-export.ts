/**
 * Reads what v1 can hand us and returns its workspace shape ({clients, projects, fin}).
 * Accepted inputs:
 *  1. v1 «الإعدادات ← تصدير البيانات» file: { "buad2_clients": "<json>", "buad2_projects": "<json>",
 *     "buad2_fin_<projectId>": "<json>", … } (values are JSON strings, app.html Pages.exportData).
 *  2. A raw workspace object { clients, projects, fin } (GET /api/workspace).
 *  3. A snapshot { workspace: … } as used by the CLI.
 */
export type V1Workspace = {
  clients: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  fin: Record<string, Record<string, unknown>>;
};

const parse = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
};
const arr = (v: unknown) =>
  Array.isArray(v)
    ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[])
    : [];

export function parseV1Export(input: unknown): V1Workspace | null {
  const data = parse(input);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;

  if ("buad2_clients" in o || "buad2_projects" in o) {
    const fin: V1Workspace["fin"] = {};
    for (const [k, v] of Object.entries(o)) {
      if (!k.startsWith("buad2_fin_")) continue;
      const f = parse(v);
      if (f && typeof f === "object")
        fin[k.slice("buad2_fin_".length)] = f as Record<string, unknown>;
    }
    return { clients: arr(parse(o.buad2_clients)), projects: arr(parse(o.buad2_projects)), fin };
  }
  const ws = "workspace" in o ? parse(o.workspace) : o;
  if (!ws || typeof ws !== "object") return null;
  const w = ws as Record<string, unknown>;
  if (!("clients" in w) && !("projects" in w)) return null;
  const fin = w.fin && typeof w.fin === "object" ? (w.fin as V1Workspace["fin"]) : {};
  return { clients: arr(w.clients), projects: arr(w.projects), fin };
}

/** Keep only the chosen clients and everything that belongs to them (projects, their fin). */
export function selectClients(ws: V1Workspace, clientIds: string[] | "all"): V1Workspace {
  if (clientIds === "all") return ws;
  const keep = new Set(clientIds);
  const clients = ws.clients.filter((c) => keep.has(String(c.id)));
  const projects = ws.projects.filter((p) => keep.has(String(p.client_id)));
  const fin: V1Workspace["fin"] = {};
  for (const p of projects) {
    const f = ws.fin[String(p.id)];
    if (f) fin[String(p.id)] = { ctrl: f.ctrl }; // only what this module uses
  }
  return { clients, projects, fin };
}

const FILLED_FIELDS = [
  "type",
  "email",
  "phone",
  "city",
  "reg_no",
  "tax_no",
  "address",
  "contact_name",
  "website",
  "logo",
] as const;

/** 0–100: how much of the client card is filled in v1 (the 100-day variant `contact` counts too). */
export function completeness(c: Record<string, unknown>): number {
  const has = (k: string) => typeof c[k] === "string" && (c[k] as string).trim() !== "";
  const n = FILLED_FIELDS.filter((k) => has(k) || (k === "contact_name" && has("contact"))).length;
  return Math.round((n / FILLED_FIELDS.length) * 100);
}

export type ClientPreview = {
  id: string;
  name: string;
  type: string;
  city: string;
  projectCount: number;
  statuses: Record<string, number>;
  completeness: number;
  /** Ranking for "best clients to try first": rich cards with several, varied projects. */
  score: number;
};

export function previewClients(ws: V1Workspace): ClientPreview[] {
  const byClient = new Map<string, Record<string, unknown>[]>();
  for (const p of ws.projects) {
    const k = String(p.client_id ?? "");
    byClient.set(k, [...(byClient.get(k) ?? []), p]);
  }
  return ws.clients
    .filter((c) => typeof c.name === "string" && c.name.trim())
    .map((c) => {
      const ps = byClient.get(String(c.id)) ?? [];
      const statuses: Record<string, number> = {};
      for (const p of ps)
        statuses[String(p.status || "active")] = (statuses[String(p.status || "active")] ?? 0) + 1;
      const comp = completeness(c);
      const withValue = ps.filter((p) => {
        const v = (ws.fin[String(p.id)]?.ctrl as Record<string, unknown> | undefined)
          ?.contract_value;
        return Number.parseFloat(String(v ?? p._initial_contract_val ?? 0)) > 0;
      }).length;
      return {
        id: String(c.id),
        name: String(c.name).trim(),
        type: String(c.type ?? ""),
        city: String(c.city ?? ""),
        projectCount: ps.length,
        statuses,
        completeness: comp,
        score:
          comp +
          Math.min(ps.length, 5) * 12 +
          Object.keys(statuses).length * 6 +
          Math.min(withValue, 3) * 5,
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ar"));
}
