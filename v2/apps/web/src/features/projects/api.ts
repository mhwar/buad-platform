import type { ProjectInput } from "@buad/schema/clients";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../api";
import { ok } from "../../lib/format";

export type ProjectStatus = "draft" | "active" | "completed" | "paused" | "cancelled";
export type ProjectListItem = {
  id: string;
  number: string;
  name: string;
  type: string;
  status: ProjectStatus;
  visibility: "team" | "private";
  location: string;
  startDate: string;
  endDate: string;
  expectedValue: number;
  /** Contract total incl. VAT (halalas), from finance when set up. */
  contractTotal: number;
  archivedAt: number | null;
  clientId: string;
  clientName: string;
  clientCode: string;
  clientLogoUrl: string;
  /** The service and package the project was contracted on ("" = none). */
  productId: string;
  productName: string;
  packageId: string;
  packageName: string;
};
export type Project = Omit<
  ProjectListItem,
  "clientName" | "clientCode" | "contractTotal" | "clientLogoUrl" | "productName"
> & {
  createdBy: string;
  ownerId: string;
  payDate: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
};
export type ProjectDetail = {
  project: Project;
  service: {
    productId: string;
    productName: string;
    packageId: string;
    packageName: string;
  } | null;
  client: {
    id: string;
    code: string;
    name: string;
    type: string;
    archivedAt: number | null;
    logoUrl: string;
  } | null;
  financeExists?: boolean;
  /** The project's finance went through a finance-aware import (even if v1 had none). */
  financeImported?: boolean;
};
export type ProjectFilters = {
  q?: string;
  status?: string;
  clientId?: string;
  /** A product id, or "none" for projects without a service. */
  product?: string;
  sort?: "newest" | "name" | "value";
  archived?: "0" | "1";
};

export const projectKeys = {
  all: ["projects"] as const,
  list: (f: ProjectFilters) => ["projects", "list", f] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
};

export const projectsQuery = (f: ProjectFilters) =>
  queryOptions({
    queryKey: projectKeys.list(f),
    queryFn: async () =>
      ok<{ items: ProjectListItem[]; counts: Record<string, number> }>(
        await api.api.projects.$get({
          query: {
            sort: f.sort ?? "newest",
            archived: f.archived ?? "0",
            ...(f.q ? { q: f.q } : {}),
            ...(f.status ? { status: f.status } : {}),
            ...(f.clientId ? { clientId: f.clientId } : {}),
            ...(f.product ? { product: f.product } : {}),
          },
        }),
      ),
    placeholderData: (prev) => prev,
  });

export const projectQuery = (id: string) =>
  queryOptions({
    queryKey: projectKeys.detail(id),
    queryFn: async () => ok<ProjectDetail>(await api.api.projects[":id"].$get({ param: { id } })),
  });

export const createProject = async (body: ProjectInput) =>
  ok<{ id: string; number: string }>(await api.api.projects.$post({ json: body }));
export const updateProject = async (id: string, body: Partial<ProjectInput>) =>
  ok<{ ok: true }>(await api.api.projects[":id"].$patch({ param: { id }, json: body }));
export const archiveProject = async (id: string, restore = false) =>
  ok<{ ok: true }>(
    await (restore
      ? api.api.projects[":id"].restore.$post({ param: { id } })
      : api.api.projects[":id"].archive.$post({ param: { id } })),
  );
export const deleteProject = async (id: string) =>
  ok<{ ok: true }>(await api.api.projects[":id"].$delete({ param: { id } }));
