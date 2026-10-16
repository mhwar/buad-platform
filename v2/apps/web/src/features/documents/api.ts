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
  outgoingNo: string;
  updatedAt: number;
  /** When it last changed status (0 = not kept yet: fall back to updatedAt). */
  statusChangedAt?: number;
  version: number;
};

/** «بانتظار الاعتماد منذ …» for a document in review, from when it got there. */
export function waitingLabel(
  d: { status: string; statusChangedAt?: number; updatedAt: number },
  now = Date.now(),
) {
  if (d.status !== "review") return "";
  const since = d.statusChangedAt || d.updatedAt;
  const days = Math.max(0, Math.floor((now / 1000 - since) / 86400));
  return days === 0
    ? "بانتظار الاعتماد منذ اليوم"
    : days === 1
      ? "بانتظار الاعتماد منذ يوم"
      : days === 2
        ? "بانتظار الاعتماد منذ يومين"
        : `بانتظار الاعتماد منذ ${days} ${days <= 10 ? "أيام" : "يوماً"}`;
}
export type RegisterItem = {
  id: string;
  kind: "contract" | "letter";
  number: string;
  title: string;
  status: DocStatus;
  outgoingNo: string;
  outgoingAt: number | null;
  updatedAt: number;
  statusChangedAt?: number;
  projectId: string;
  projectNumber: string;
  projectName: string;
  clientId: string;
  clientName: string;
  clientLogo: string;
};
export type Register = {
  items: RegisterItem[];
  counts: { kind: "contract" | "letter"; status: DocStatus; n: number }[];
  outgoingCount: number;
};
export type RegisterFilter = {
  q?: string;
  kind?: "contract" | "letter";
  status?: DocStatus;
  outgoing?: "1";
  clientId?: string;
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
    outgoingNo: string;
    outgoingAt: number | null;
    updatedAt: number;
    statusChangedAt?: number;
  };
  project: { id: string; number: string; name: string };
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
export type Share = {
  id: string;
  channel: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  views: number;
  lastViewedAt: number | null;
};
/** What a share link shows: the approved version, read-only. */
export type PublicDocument = {
  document: Pick<DocDetail["document"], "kind" | "number" | "title" | "content" | "layout">;
  values: Resolved;
  org: DocDetail["org"];
  outgoing: string;
  approvedAt: number;
  expiresAt: number;
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
  register: (f: RegisterFilter) => ["documents", "register", f] as const,
};

export const registerQuery = (f: RegisterFilter) =>
  queryOptions({
    queryKey: docKeys.register(f),
    queryFn: async () => {
      const qs = new URLSearchParams(
        Object.entries(f).filter((e): e is [string, string] => !!e[1]),
      ).toString();
      return ok<Register>(await fetch(`/api/documents${qs ? `?${qs}` : ""}`));
    },
    placeholderData: (prev) => prev,
  });

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
  outgoing: async (id: string) =>
    ok<{ outgoingNo: string; created: boolean }>(
      await fetch(`/api/documents/${id}/outgoing`, json("POST")),
    ),
  shares: async (id: string) =>
    (await ok<{ items: Share[] }>(await fetch(`/api/documents/${id}/shares`))).items,
  share: async (id: string, days: 7 | 30, channel: "whatsapp" | "email" | "link") =>
    ok<{ path: string; expiresAt: number }>(
      await fetch(`/api/documents/${id}/shares`, json("POST", { days, channel })),
    ),
  revokeShare: async (id: string, shareId: string) =>
    ok<{ ok: true }>(await fetch(`/api/documents/${id}/shares/${shareId}`, json("DELETE"))),
  remove: async (id: string) =>
    ok<{ ok: true }>(await fetch(`/api/documents/${id}`, json("DELETE"))),
};
