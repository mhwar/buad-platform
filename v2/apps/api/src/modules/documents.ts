import {
  CONTRACT_ORDINALS,
  CONTRACT_TEMPLATES,
  cashbackBody,
  type DocContext,
  formatCode,
  initialVariables,
  LETTER_TEMPLATES,
  renumberClauses,
  resolveVariables,
} from "@buad/domain";
import { clientContacts, clients, documents, documentVersions, projects } from "@buad/schema/db";
import {
  type Clause,
  createDocumentInput,
  documentPatch,
  layoutSchema,
  statusInput,
} from "@buad/schema/documents";
import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, isNotNull, ne, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import type { AuthUser, Db } from "../auth/service";
import { likeTerm, logoUrlSql, newId, nextCounter, nowSec } from "./common";
import { loadFinance } from "./finance";
import { loadOrgProfile } from "./org";
import { loadVisible, visibleProjects } from "./projects";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
const manager = requirePerm("documents.edit");
const today = () => new Date().toISOString().slice(0, 10);
const registerQuery = z.object({
  q: z.string().max(100).optional(),
  kind: z.enum(["contract", "letter"]).optional(),
  status: z.enum(["draft", "review", "approved"]).optional(),
  outgoing: z.enum(["0", "1"]).optional(),
  clientId: z.string().max(64).optional(),
  projectId: z.string().max(64).optional(),
});
const BUILTIN_CONTRACTS = Object.keys(CONTRACT_TEMPLATES) as (keyof typeof CONTRACT_TEMPLATES)[];

/** Everything a document can draw on, gathered once per request. */
export async function buildContext(
  db: Db,
  project: NonNullable<Awaited<ReturnType<typeof loadVisible>>>,
  orgId: string,
): Promise<DocContext> {
  const org = await loadOrgProfile(db, orgId);
  const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId)).limit(1);
  const fin = await loadFinance(db, project);
  const [sig] = client
    ? await db
        .select()
        .from(clientContacts)
        .where(and(eq(clientContacts.clientId, client.id), eq(clientContacts.isSignatory, true)))
        .limit(1)
    : [];
  return {
    org,
    client: client
      ? {
          name: client.name,
          contactName: sig?.name ?? "",
          contactTitle: sig?.title ?? "",
          regNo: client.regNo,
          taxNo: client.taxNo,
          address: client.address,
          city: client.city,
          phone: client.phone,
          email: client.email,
        }
      : null,
    project: { name: project.name },
    finance: {
      grossTotal: fin.summary.grossTotal,
      cashback: fin.summary.cb,
      contractNo: fin.ctrl.contractNo,
      contractDate: fin.ctrl.contractDate,
    },
    today: today(),
  };
}

const toStrings = (r: ReturnType<typeof initialVariables>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.value]));

function templateClauses(key: string): { title: string; clauses: Clause[] } | null {
  if ((BUILTIN_CONTRACTS as string[]).includes(key)) {
    const t = CONTRACT_TEMPLATES[key as keyof typeof CONTRACT_TEMPLATES];
    const clauses = t.clauses.map((c) => ({
      id: newId("cl"),
      key: c.key,
      title: c.title ?? "",
      baseTitle: c.title ? "" : (c.baseTitle ?? ""),
      content: c.content,
      pageBreak: false,
    }));
    return { title: t.title, clauses: renumberClauses(clauses, CONTRACT_ORDINALS) };
  }
  return null;
}

function parse(doc: typeof documents.$inferSelect) {
  return {
    ...doc,
    variables: JSON.parse(doc.variables) as Record<string, string>,
    content: JSON.parse(doc.content) as Clause[],
    layout: layoutSchema.parse(JSON.parse(doc.layout)),
  };
}

export async function loadDoc(db: Db, me: AuthUser, id: string) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.orgId, me.orgId)))
    .limit(1);
  if (!doc) return null;
  // The document follows its project's visibility.
  const project = await loadVisible(db, me, doc.projectId);
  return project ? { doc, project } : null;
}

async function view(
  db: Db,
  me: AuthUser,
  doc: typeof documents.$inferSelect,
  project: NonNullable<Awaited<ReturnType<typeof loadVisible>>>,
) {
  const d = parse(doc);
  const ctx = await buildContext(db, project, me.orgId);
  const versions = await db
    .select({
      version: documentVersions.version,
      approvedBy: documentVersions.approvedBy,
      approvedAt: documentVersions.approvedAt,
    })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, doc.id))
    .orderBy(desc(documentVersions.version));
  return {
    document: d,
    project: { id: project.id, number: project.number, name: project.name },
    values: resolveVariables(d.variables, ctx),
    /** What each variable would be if filled automatically now (for «تلقائي» badges and reset). */
    auto: initialVariables(ctx),
    org: {
      name: ctx.org.name,
      urls: (ctx.org as unknown as { urls: Record<string, string> }).urls,
    },
    versions,
  };
}

export const projectDocumentsApp = new Hono<Env>()
  .use(requireAuth)
  .use(requirePerm("documents.view"))
  .get("/", async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const project = await loadVisible(db, me, c.req.param("projectId") ?? "");
    if (!project) return c.json({ ok: false, error: "not_found" }, 404);
    const items = await db
      .select({
        id: documents.id,
        kind: documents.kind,
        number: documents.number,
        title: documents.title,
        status: documents.status,
        outgoingNo: documents.outgoingNo,
        updatedAt: documents.updatedAt,
        version: documents.version,
      })
      .from(documents)
      .where(eq(documents.projectId, project.id))
      .orderBy(desc(documents.updatedAt));
    return c.json({ ok: true, items });
  })

  .post("/", manager, zValidator("json", createDocumentInput), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const project = await loadVisible(db, me, c.req.param("projectId") ?? "");
    if (!project) return c.json({ ok: false, error: "not_found" }, 404);
    const input = c.req.valid("json");
    const ctx = await buildContext(db, project, me.orgId);
    const variables = toStrings(initialVariables(ctx));
    let title: string;
    let content: Clause[];
    if (input.kind === "contract") {
      const t = templateClauses(input.template);
      if (!t) return c.json({ ok: false, error: "unknown_template" }, 400);
      title = input.title || t.title;
      content = t.clauses;
    } else {
      const t =
        input.template === "cashback"
          ? LETTER_TEMPLATES.cashback
          : {
              title: "",
              body: "",
              salutation: "السلام عليكم ورحمة الله وبركاته، وبعد:",
              closing: "وتفضلوا بقبول وافر التحية والتقدير،",
            };
      title = input.title || t.title;
      content = [
        {
          id: newId("cl"),
          key: "body",
          title: "",
          baseTitle: "",
          content:
            input.template === "cashback"
              ? cashbackBody(t.body, (ctx.finance?.cashback ?? 0) > 0)
              : t.body,
          pageBreak: false,
        },
      ];
      Object.assign(variables, {
        letter_to_honorific: "السادة",
        letter_to: ctx.client?.name ?? "",
        letter_to_suffix: "المحترمين",
        letter_salutation: t.salutation,
        letter_closing: t.closing,
        letter_date: ctx.today,
      });
    }
    const year = new Date().getUTCFullYear();
    const prefix = input.kind === "contract" ? "CT" : "LT";
    const number = formatCode(
      prefix,
      await nextCounter(db, me.orgId, `doc_${input.kind}`, year),
      year,
    );
    // A new contract number goes into the contract itself unless finance already has one.
    if (input.kind === "contract" && !variables.contract_no) variables.contract_no = number;
    const t = nowSec();
    const id = newId("doc");
    await db.insert(documents).values({
      id,
      orgId: me.orgId,
      projectId: project.id,
      kind: input.kind,
      number,
      title,
      templateKey: input.template,
      variables: JSON.stringify(variables),
      content: JSON.stringify(content),
      layout: JSON.stringify(layoutSchema.parse({})),
      createdBy: me.id,
      createdAt: t,
      updatedBy: me.id,
      updatedAt: t,
    });
    return c.json({ ok: true, id, number }, 201);
  });

export const documentsApp = new Hono<Env>()
  .use(requireAuth)
  .use(requirePerm("documents.view"))
  .get("/templates", (c) =>
    c.json({
      ok: true,
      contracts: BUILTIN_CONTRACTS.map((k) => ({
        key: k,
        title: CONTRACT_TEMPLATES[k].title,
        clauses: CONTRACT_TEMPLATES[k].clauses.length,
      })),
      letters: [
        { key: "cashback", title: LETTER_TEMPLATES.cashback.title },
        { key: "custom", title: "خطاب مخصص" },
      ],
    }),
  )

  // The organisation's register: every document the user may see, across projects.
  .get("/", zValidator("query", registerQuery), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const q = c.req.valid("query");
    const base: (SQL | undefined)[] = [eq(documents.orgId, me.orgId), visibleProjects(me).where];
    const where: (SQL | undefined)[] = [...base];
    if (q.kind) where.push(eq(documents.kind, q.kind));
    if (q.status) where.push(eq(documents.status, q.status));
    if (q.outgoing === "1") where.push(ne(documents.outgoingNo, ""));
    if (q.clientId) where.push(eq(projects.clientId, q.clientId));
    if (q.projectId) where.push(eq(documents.projectId, q.projectId));
    if (q.q) {
      const t = likeTerm(q.q);
      where.push(
        or(
          sql`${documents.title} LIKE ${t} ESCAPE '\\'`,
          sql`${documents.number} LIKE ${t} ESCAPE '\\'`,
          sql`${documents.outgoingNo} LIKE ${t} ESCAPE '\\'`,
          sql`${projects.name} LIKE ${t} ESCAPE '\\'`,
          sql`${clients.name} LIKE ${t} ESCAPE '\\'`,
        ),
      );
    }
    const items = await db
      .select({
        id: documents.id,
        kind: documents.kind,
        number: documents.number,
        title: documents.title,
        status: documents.status,
        outgoingNo: documents.outgoingNo,
        outgoingAt: documents.outgoingAt,
        updatedAt: documents.updatedAt,
        projectId: projects.id,
        projectNumber: projects.number,
        projectName: projects.name,
        clientId: clients.id,
        clientName: clients.name,
        clientLogo: sql<string>`${logoUrlSql("clients")}`,
      })
      .from(documents)
      .innerJoin(projects, eq(projects.id, documents.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(and(...where))
      .orderBy(
        ...(q.outgoing === "1"
          ? [desc(documents.outgoingAt), desc(documents.outgoingNo)]
          : [desc(documents.updatedAt)]),
      )
      .limit(500);
    const counts = await db
      .select({ kind: documents.kind, status: documents.status, n: count() })
      .from(documents)
      .innerJoin(projects, eq(projects.id, documents.projectId))
      .where(and(...base))
      .groupBy(documents.kind, documents.status);
    const [out] = await db
      .select({ n: count() })
      .from(documents)
      .innerJoin(projects, eq(projects.id, documents.projectId))
      .where(and(...base, isNotNull(documents.outgoingAt)));
    return c.json({ ok: true, items, counts, outgoingCount: out?.n ?? 0 });
  })

  .get("/:id", async (c) => {
    const db = c.get("db");
    const found = await loadDoc(db, c.get("user"), c.req.param("id"));
    if (!found) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, ...(await view(db, c.get("user"), found.doc, found.project)) });
  })

  .patch("/:id", manager, zValidator("json", documentPatch), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const found = await loadDoc(db, me, c.req.param("id"));
    if (!found) return c.json({ ok: false, error: "not_found" }, 404);
    const { doc } = found;
    const v = c.req.valid("json");
    if (doc.status === "approved") return c.json({ ok: false, error: "approved_locked" }, 409);
    if (v.version !== doc.version)
      return c.json({ ok: false, error: "stale", version: doc.version }, 409);
    const current = parse(doc);
    const set: Partial<typeof documents.$inferInsert> = {
      version: doc.version + 1,
      updatedBy: me.id,
      updatedAt: nowSec(),
    };
    if (v.title !== undefined) set.title = v.title;
    if (v.number !== undefined) set.number = v.number;
    if (v.variables !== undefined)
      set.variables = JSON.stringify({ ...current.variables, ...v.variables });
    if (v.content !== undefined)
      set.content = JSON.stringify(renumberClauses(v.content, CONTRACT_ORDINALS));
    if (v.layout !== undefined)
      set.layout = JSON.stringify(layoutSchema.parse({ ...current.layout, ...v.layout }));
    try {
      const upd = await db
        .update(documents)
        .set(set)
        .where(and(eq(documents.id, doc.id), eq(documents.version, doc.version)))
        .returning({ v: documents.version });
      if (!upd.length) return c.json({ ok: false, error: "stale", version: doc.version + 1 }, 409);
    } catch {
      return c.json({ ok: false, error: "number_taken" }, 409);
    }
    const [fresh] = await db.select().from(documents).where(eq(documents.id, doc.id)).limit(1);
    return c.json({ ok: true, ...(await view(db, me, fresh!, found.project)) });
  })

  // draft → review → approved; approved → draft reopens a new version (the approved one stays in history).
  .post("/:id/status", manager, zValidator("json", statusInput), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const found = await loadDoc(db, me, c.req.param("id"));
    if (!found) return c.json({ ok: false, error: "not_found" }, 404);
    const { doc } = found;
    const { to, version } = c.req.valid("json");
    if (version !== doc.version)
      return c.json({ ok: false, error: "stale", version: doc.version }, 409);
    const t = nowSec();
    const set: Partial<typeof documents.$inferInsert> = {
      status: to,
      version: doc.version + 1,
      updatedBy: me.id,
      updatedAt: t,
    };
    if (to === "approved") {
      if (doc.status === "approved") return c.json({ ok: false, error: "already_approved" }, 409);
      set.approvedBy = me.id;
      set.approvedAt = t;
      const v = await view(db, me, doc, found.project);
      // Snapshot what was approved, with every variable filled as it was at that moment.
      await db.insert(documentVersions).values({
        id: newId("dv"),
        documentId: doc.id,
        version: doc.version,
        snapshot: JSON.stringify({ document: v.document, values: v.values }),
        approvedBy: me.id,
        approvedAt: t,
      });
    }
    const upd = await db
      .update(documents)
      .set(set)
      .where(and(eq(documents.id, doc.id), eq(documents.version, doc.version)))
      .returning({ v: documents.version });
    if (!upd.length) return c.json({ ok: false, error: "stale" }, 409);
    const [fresh] = await db.select().from(documents).where(eq(documents.id, doc.id)).limit(1);
    return c.json({ ok: true, ...(await view(db, me, fresh!, found.project)) });
  })

  // Registers an approved document in the outgoing (صادر) ledger. Optional, once, and never reused.
  .post("/:id/outgoing", manager, async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const found = await loadDoc(db, me, c.req.param("id"));
    if (!found) return c.json({ ok: false, error: "not_found" }, 404);
    const { doc, project } = found;
    if (doc.outgoingNo) return c.json({ ok: true, outgoingNo: doc.outgoingNo, created: false });
    if (doc.status !== "approved") return c.json({ ok: false, error: "not_approved" }, 409);
    const year = new Date().getUTCFullYear();
    const outgoingNo = formatCode("ص", await nextCounter(db, me.orgId, "outgoing", year), year);
    const upd = await db
      .update(documents)
      .set({ outgoingNo, outgoingAt: nowSec(), outgoingBy: me.id })
      .where(and(eq(documents.id, doc.id), eq(documents.outgoingNo, "")))
      .returning({ id: documents.id });
    if (!upd.length) {
      // Someone registered it a moment ago: return theirs (the number taken here is skipped).
      const [cur] = await db
        .select({ n: documents.outgoingNo })
        .from(documents)
        .where(eq(documents.id, doc.id));
      return c.json({ ok: true, outgoingNo: cur?.n ?? "", created: false });
    }
    return c.json({ ok: true, outgoingNo, projectNumber: project.number, created: true }, 201);
  })

  .get("/:id/versions/:version", async (c) => {
    const db = c.get("db");
    const found = await loadDoc(db, c.get("user"), c.req.param("id"));
    if (!found) return c.json({ ok: false, error: "not_found" }, 404);
    const [row] = await db
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentId, found.doc.id),
          eq(documentVersions.version, Number(c.req.param("version"))),
        ),
      )
      .limit(1);
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({
      ok: true,
      ...JSON.parse(row.snapshot),
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt,
    });
  })

  .post("/:id/duplicate", manager, async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const found = await loadDoc(db, me, c.req.param("id"));
    if (!found) return c.json({ ok: false, error: "not_found" }, 404);
    const { doc } = found;
    const year = new Date().getUTCFullYear();
    const number = formatCode(
      doc.kind === "contract" ? "CT" : "LT",
      await nextCounter(db, me.orgId, `doc_${doc.kind}`, year),
      year,
    );
    const id = newId("doc");
    const t = nowSec();
    await db.insert(documents).values({
      ...doc,
      id,
      number,
      title: `${doc.title} (نسخة)`,
      status: "draft",
      version: 1,
      approvedBy: "",
      approvedAt: null,
      outgoingNo: "",
      outgoingAt: null,
      outgoingBy: "",
      createdBy: me.id,
      createdAt: t,
      updatedBy: me.id,
      updatedAt: t,
    });
    return c.json({ ok: true, id, number }, 201);
  })

  // Only drafts that were never approved can be deleted; approved history is kept.
  .delete("/:id", manager, async (c) => {
    const db = c.get("db");
    const found = await loadDoc(db, c.get("user"), c.req.param("id"));
    if (!found) return c.json({ ok: false, error: "not_found" }, 404);
    const [v] = await db
      .select({ n: count() })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, found.doc.id));
    if (found.doc.status !== "draft" || (v?.n ?? 0) > 0)
      return c.json({ ok: false, error: "has_history" }, 409);
    await db.delete(documents).where(eq(documents.id, found.doc.id));
    return c.json({ ok: true });
  });
