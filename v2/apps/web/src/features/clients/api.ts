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
};
export type Client = Omit<
  ClientListItem,
  "projectCount" | "projectValue" | "logoUrl" | "recentProjects" | "documentsCount" | "lastActivity"
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
  sort?: "newest" | "name" | "value";
  archived?: "0" | "1";
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
