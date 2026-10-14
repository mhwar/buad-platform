import type { Resolved } from "@buad/domain";
import type { Clause, DocLayout, DocumentPatch } from "@buad/schema/documents";
import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type DocStatus = "draft" | "review" | "approved";
export type DocListItem = {
  id: string;
  kind: "contract" | "letter";
  number: string;
  title: string;
  status: DocStatus;
  updatedAt: number;
  version: number;
};
export type DocDetail = {
  document: {
    id: string;
    projectId: string;
    kind: "contract" | "letter";
    number: string;
    title: string;
    templateKey: string;
    status: DocStatus;
    variables: Record<string, string>;
    content: Clause[];
    layout: DocLayout;
    version: number;
    approvedBy: string;
    approvedAt: number | null;
    updatedAt: number;
  };
  values: Resolved;
  auto: Resolved;
  org: {
    name: string;
    urls: Record<
      "logoAsset" | "stampAsset" | "signatureAsset" | "headerAsset" | "footerAsset",
      string
    >;
  };
  versions: { version: number; approvedBy: string; approvedAt: number }[];
};
export type Templates = {
  contracts: { key: string; title: string; clauses: number }[];
  letters: { key: string; title: string }[];
};

const json = (method: string, body?: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const docKeys = {
  list: (projectId: string) => ["documents", "list", projectId] as const,
  detail: (id: string) => ["documents", "detail", id] as const,
};

export const documentsQuery = (projectId: string) =>
  queryOptions({
    queryKey: docKeys.list(projectId),
    queryFn: async () =>
      (await ok<{ items: DocListItem[] }>(await fetch(`/api/projects/${projectId}/documents`)))
        .items,
  });
export const documentQuery = (id: string) =>
  queryOptions({
    queryKey: docKeys.detail(id),
    queryFn: async () => ok<DocDetail>(await fetch(`/api/documents/${id}`)),
  });
export const templatesQuery = queryOptions({
  queryKey: ["doc-templates"],
  queryFn: async () => ok<Templates>(await fetch("/api/documents/templates")),
  staleTime: Number.POSITIVE_INFINITY,
});

export const docApi = {
  create: async (projectId: string, body: { kind: "contract" | "letter"; template: string }) =>
    ok<{ id: string; number: string }>(
      await fetch(`/api/projects/${projectId}/documents`, json("POST", body)),
    ),
  patch: async (id: string, body: DocumentPatch) =>
    ok<DocDetail>(await fetch(`/api/documents/${id}`, json("PATCH", body))),
  status: async (id: string, to: DocStatus, version: number) =>
    ok<DocDetail>(await fetch(`/api/documents/${id}/status`, json("POST", { to, version }))),
  duplicate: async (id: string) =>
    ok<{ id: string; number: string }>(await fetch(`/api/documents/${id}/duplicate`, json("POST"))),
  remove: async (id: string) =>
    ok<{ ok: true }>(await fetch(`/api/documents/${id}`, json("DELETE"))),
};
