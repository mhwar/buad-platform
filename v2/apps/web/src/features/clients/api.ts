import type { Relationship } from "@buad/domain";
import type { ClientInput } from "@buad/schema/clients";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../api";
import { ok } from "../../lib/format";

export type ClientType = "company" | "association" | "government" | "individual" | "other";
export type ClientListItem = {
  id: string;
  code: string;
  name: string;
  type: ClientType;
  city: string;
  email: string;
  phone: string;
  /** Cached image URL ("" when the client has no logo). */
  logoUrl: string;
  createdAt: number;
  archivedAt: number | null;
  projectCount: number;
  projectValue: number;
  /** Up to three most recently touched live projects. */
  recentProjects: { id: string; name: string }[];
  documentsCount: number;
  lastActivity: number | null;
  /** CRM: owner, source, labels, the next follow-up and the last contact. */
  ownerId: string;
  ownerName: string;
  source: string;
  tags: string[];
  nextFollowUpAt: string;
  lastContactAt: number;
  activeProjects: number;
  completedProjects: number;
  openRequests: number;
  openQuotes: number;
  /** Still owed on its work (halalas); null when the viewer may not see project finance. */
  owed?: number | null;
  lateInstalments?: number;
  relationship: Relationship;
};
export type Client = Omit<
  ClientListItem,
  | "projectCount"
  | "projectValue"
  | "logoUrl"
  | "recentProjects"
  | "documentsCount"
  | "lastActivity"
  | "ownerName"
  | "tags"
  | "nextFollowUpAt"
  | "lastContactAt"
  | "activeProjects"
  | "completedProjects"
  | "openRequests"
  | "openQuotes"
  | "relationship"
  | "owed"
  | "lateInstalments"
  | "ownerId"
  | "source"
> & {
  /** The logo itself (data URL), needed by the edit form. */
  logo: string;
  regNo: string;
  taxNo: string;
  address: string;
  website: string;
  notes: string;
  createdBy: string;
  updatedAt: number;
};
export type Contact = {
  id: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  isSignatory: boolean;
};
export type ClientProject = {
  id: string;
  number: string;
  name: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  expectedValue: number;
  contractTotal: number;
  archivedAt: number | null;
};
export type ClientDetail = { client: Client; contacts: Contact[]; projects: ClientProject[] };
export type ClientFilters = {
  q?: string;
  type?: string;
  sort?: "newest" | "name" | "value" | "contact";
  archived?: "0" | "1";
  owner?: string;
  rel?: Relationship;
  source?: string;
  tag?: string;
  followup?: "due";
};

export const clientKeys = {
  all: ["clients"] as const,
  list: (f: ClientFilters) => ["clients", "list", f] as const,
  detail: (id: string) => ["clients", "detail", id] as const,
  statement: (id: string) => ["clients", "statement", id] as const,
};

/** Amounts in riyals. */
export type StatementLine = {
  id: string;
  number: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  hasFinance: boolean;
  contractNo: string;
  contractNet: number;
  vat: number;
  gross: number;
  spent: number;
  income: number;
  remaining: number;
  received: number;
  owed: number;
};
export type Statement = {
  client: {
    id: string;
    code: string;
    name: string;
    regNo: string;
    taxNo: string;
    address: string;
    city: string;
    phone: string;
    email: string;
  };
  org: { name: string; reg: string; tax: string; urls: Record<string, string> };
  items: StatementLine[];
  totals: Record<
    "contractNet" | "vat" | "gross" | "spent" | "income" | "remaining" | "received" | "owed",
    number
  >;
  generatedAt: number;
};
export const statementQuery = (id: string) =>
  queryOptions({
    queryKey: clientKeys.statement(id),
    queryFn: async () => ok<Statement>(await fetch(`/api/clients/${id}/statement`)),
  });

export const clientsQuery = (f: ClientFilters) =>
  queryOptions({
    queryKey: clientKeys.list(f),
    queryFn: async () =>
      ok<{ items: ClientListItem[]; counts: Record<string, number> }>(
        await api.api.clients.$get({
          query: {
            sort: f.sort ?? "newest",
            archived: f.archived ?? "0",
            ...(f.q ? { q: f.q } : {}),
            ...(f.type ? { type: f.type } : {}),
            ...(f.owner ? { owner: f.owner } : {}),
            ...(f.rel ? { rel: f.rel } : {}),
            ...(f.source ? { source: f.source } : {}),
            ...(f.tag ? { tag: f.tag } : {}),
            ...(f.followup ? { followup: f.followup } : {}),
          },
        }),
      ),
    placeholderData: (prev) => prev,
  });

export const clientQuery = (id: string) =>
  queryOptions({
    queryKey: clientKeys.detail(id),
    queryFn: async () => ok<ClientDetail>(await api.api.clients[":id"].$get({ param: { id } })),
  });

export const createClient = async (body: ClientInput) =>
  ok<{ id: string; code: string }>(await api.api.clients.$post({ json: body }));
export const updateClient = async (id: string, body: Partial<ClientInput>) =>
  ok<{ ok: true }>(await api.api.clients[":id"].$patch({ param: { id }, json: body }));
export const archiveClient = async (id: string, restore = false) =>
  ok<{ ok: true }>(
    await (restore
      ? api.api.clients[":id"].restore.$post({ param: { id } })
      : api.api.clients[":id"].archive.$post({ param: { id } })),
  );
export const deleteClient = async (id: string) =>
  ok<{ ok: true }>(await api.api.clients[":id"].$delete({ param: { id } }));

export type Dup = {
  id: string;
  code: string;
  name: string;
  field?: "regNo" | "taxNo";
  archivedAt?: number | null;
};
export const checkDuplicate = async (q: {
  name?: string;
  regNo?: string;
  taxNo?: string;
  selfId?: string;
}) =>
  ok<{ duplicate: Dup | null; similar: Dup | null }>(
    await api.api.clients["check-duplicate"].$get({ query: q as Record<string, string> }),
  );

/* ── CRM ─────────────────────────────────────────────────────────────────── */
export type Activity = {
  id: string;
  type: "call" | "meeting" | "visit" | "email" | "whatsapp" | "note" | "stage";
  summary: string;
  at: number;
  createdByName: string;
  requestId: string;
};
export type ClientCrm = {
  relationship: Relationship;
  crm: {
    ownerId: string;
    ownerName: string;
    source: string;
    tags: string[];
    nextFollowUpAt: string;
    lastContactAt: number;
  };
  activities: Activity[];
};
export const crmQuery = (id: string) =>
  queryOptions({
    queryKey: ["crm", id],
    queryFn: async () => ok<ClientCrm>(await fetch(`/api/crm/clients/${id}`)),
  });

export type FollowUp = {
  kind: "client" | "request";
  id: string;
  title: string;
  subtitle: string;
  phone: string;
  date: string;
  ownerId: string;
  ownerName: string;
  link: string;
  value: number;
  state: "none" | "overdue" | "today" | "soon" | "later";
};
export const followupsQuery = (scope: "mine" | "all") =>
  queryOptions({
    queryKey: ["followups", scope],
    queryFn: async () =>
      ok<{ today: string; items: FollowUp[] }>(await fetch(`/api/crm/followups?scope=${scope}`)),
  });
