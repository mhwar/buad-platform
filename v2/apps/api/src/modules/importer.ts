import { CONTRACT_ORDINALS, formatCode, renumberClauses } from "@buad/domain";
import {
  financeParity,
  type Issue,
  type Parity,
  type PlannedDoc,
  parseV1Export,
  planBusiness,
  planDocuments,
  planFinance,
} from "@buad/migrate";
import {
  clientContacts,
  clients,
  documents,
  documentVersions,
  financeBudgetItems,
  financeCategories,
  financeEntries,
  legacyMap,
  orgProfile,
  projectFinance,
  projects,
  users,
} from "@buad/schema/db";
import { layoutSchema } from "@buad/schema/documents";
import { and, eq, inArray, ne, notLike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRole, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { type FileStore, storeAsset } from "./assets";
import { nowSec } from "./common";
import { loadOrgProfile } from "./org";

type Env = { Bindings: { JWT_SECRET: string; FILES?: FileStore }; Variables: Vars };
const MAX_CLIENTS = 2000;

/** Reserve k consecutive numbers in one atomic UPSERT; returns the first. */
async function reserve(
  db: Db,
  orgId: string,
  kind: string,
  year: number,
  k: number,
): Promise<number> {
  const row = (await db.get(sql`
    INSERT INTO org_counters (org_id, kind, year, value) VALUES (${orgId}, ${kind}, ${year}, ${k})
    ON CONFLICT(org_id, kind, year) DO UPDATE SET value = org_counters.value + ${k}
    RETURNING value
  `)) as { value: number } | undefined;
  if (!row) throw new Error("counter_failed");
  return Number(row.value) - k + 1;
}

/** D1 runs a batch atomically in one round trip; the test driver has no batch, so run in order. */
async function runAll(db: Db, queries: { run: () => unknown }[]) {
  if (!queries.length) return;
  const d = db as unknown as { batch?: (q: unknown[]) => Promise<unknown> };
  if (typeof d.batch === "function") {
    for (let i = 0; i < queries.length; i += 200) await d.batch(queries.slice(i, i + 200));
  } else {
    for (const q of queries) await q.run();
  }
}

const chunks = <T>(xs: T[], n = 90) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export const importApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRole("owner"))

  /**
   * Import v1 clients and their projects into the caller's org.
   * Body: the v1 export (or a subset of it). Re-running refreshes data; codes/numbers never change.
   */
  .post("/v1", async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const ws = parseV1Export(await c.req.json().catch(() => null));
    if (!ws) return c.json({ ok: false, error: "invalid_file" }, 400);
    if (ws.clients.length > MAX_CLIENTS) return c.json({ ok: false, error: "too_many" }, 413);

    const b = planBusiness(ws);
    const issues: Issue[] = [...b.issues];
    const clientIds = b.clients.map((x) => x.id);
    const projectIds = b.projects.map((x) => x.id);

    // What already exists (by v1 id), here or — impossible ids clash — in another org.
    const existingClients = new Map<string, { orgId: string; code: string }>();
    for (const part of chunks(clientIds))
      for (const r of await db
        .select({ id: clients.id, orgId: clients.orgId, code: clients.code })
        .from(clients)
        .where(inArray(clients.id, part)))
        existingClients.set(r.id, r);
    const existingProjects = new Map<string, { orgId: string; number: string }>();
    for (const part of chunks(projectIds))
      for (const r of await db
        .select({ id: projects.id, orgId: projects.orgId, number: projects.number })
        .from(projects)
        .where(inArray(projects.id, part)))
        existingProjects.set(r.id, r);

    const foreign = new Set(
      [...existingClients].filter(([, v]) => v.orgId !== me.orgId).map(([k]) => k),
    );
    for (const id of foreign)
      issues.push({
        kind: "client",
        id,
        name: "",
        severity: "rejected",
        reason: "المعرّف مستخدم في جهة أخرى",
      });
    const cl = b.clients.filter((x) => !foreign.has(x.id));
    const keepClient = new Set(cl.map((x) => x.id));
    const pr = b.projects.filter(
      (p) =>
        keepClient.has(p.clientId) && (existingProjects.get(p.id)?.orgId ?? me.orgId) === me.orgId,
    );

    // CR / VAT already used by a different client in this org would break the unique index: clear and report.
    for (const x of cl) {
      for (const field of ["regNo", "taxNo"] as const) {
        if (!x[field]) continue;
        const col = field === "regNo" ? clients.regNo : clients.taxNo;
        const [hit] = await db
          .select({ name: clients.name, code: clients.code })
          .from(clients)
          .where(and(eq(clients.orgId, me.orgId), eq(col, x[field]), ne(clients.id, x.id)))
          .limit(1);
        if (hit) {
          issues.push({
            kind: "client",
            id: x.id,
            name: x.name,
            severity: "fixed",
            reason: `${field === "regNo" ? "رقم السجل" : "الرقم الضريبي"} مستخدم لدى ${hit.name} (${hit.code})، أُفرغ`,
          });
          x[field] = "";
        }
      }
    }

    // Codes: existing rows keep theirs; new rows get a freshly reserved block (never collides with v2-created ones).
    const newClients = cl.filter((x) => !existingClients.has(x.id));
    if (newClients.length) {
      const first = await reserve(db, me.orgId, "client", 0, newClients.length);
      newClients.forEach((x, i) => (x.code = formatCode("CL", first + i)));
    }
    for (const x of cl) if (existingClients.has(x.id)) x.code = existingClients.get(x.id)!.code;
    const newByYear = new Map<number, typeof pr>();
    for (const p of pr.filter((p) => !existingProjects.has(p.id))) {
      const y = Number(p.number.split("-")[1]);
      newByYear.set(y, [...(newByYear.get(y) ?? []), p]);
    }
    for (const [year, list] of newByYear) {
      const first = await reserve(db, me.orgId, "project", year, list.length);
      list.forEach((p, i) => (p.number = formatCode("PRJ", first + i, year)));
    }
    for (const p of pr)
      if (existingProjects.has(p.id)) p.number = existingProjects.get(p.id)!.number;

    // v1 owners who are not v2 users become the importer, so every project has a real owner.
    const owners = [...new Set(pr.map((p) => p.ownerId).filter(Boolean))];
    const known = new Set<string>();
    for (const part of chunks(owners))
      for (const r of await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.orgId, me.orgId), inArray(users.id, part))))
        known.add(r.id);

    const t = nowSec();
    const by = `v1-import:${me.id}`;
    const q: { run: () => unknown }[] = [];
    for (const x of cl) {
      const row = {
        name: x.name,
        nameNorm: x.nameNorm,
        type: x.type as never,
        email: x.email,
        phone: x.phone,
        city: x.city,
        regNo: x.regNo,
        taxNo: x.taxNo,
        address: x.address,
        website: x.website,
        notes: x.notes,
        logo: x.logo,
        updatedBy: by,
        updatedAt: t,
      };
      q.push(
        db
          .insert(clients)
          .values({
            id: x.id,
            orgId: me.orgId,
            code: x.code,
            ...row,
            createdBy: by,
            createdAt: x.createdAt ?? t,
          })
          .onConflictDoUpdate({ target: clients.id, set: row }),
        db
          .insert(legacyMap)
          .values({ kind: "client", legacyId: x.id, newId: x.id })
          .onConflictDoNothing(),
      );
    }
    for (const k of b.contacts.filter((k) => keepClient.has(k.clientId))) {
      q.push(
        db
          .insert(clientContacts)
          .values({
            id: k.id,
            clientId: k.clientId,
            name: k.name,
            title: k.title,
            isSignatory: true,
          })
          .onConflictDoUpdate({ target: clientContacts.id, set: { name: k.name, title: k.title } }),
      );
    }
    for (const p of pr) {
      const row = {
        clientId: p.clientId,
        name: p.name,
        type: p.type as never,
        status: p.status as never,
        ownerId: known.has(p.ownerId) ? p.ownerId : me.id,
        visibility: p.visibility as never,
        location: p.location,
        startDate: p.startDate,
        endDate: p.endDate,
        payDate: p.payDate,
        expectedValue: p.expectedValue,
        notes: p.notes,
        updatedBy: by,
        updatedAt: t,
      };
      q.push(
        db
          .insert(projects)
          .values({
            id: p.id,
            orgId: me.orgId,
            number: p.number,
            ...row,
            createdBy: by,
            createdAt: p.createdAt ?? t,
          })
          .onConflictDoUpdate({ target: projects.id, set: row }),
        db
          .insert(legacyMap)
          .values({ kind: "project", legacyId: p.id, newId: p.id })
          .onConflictDoNothing(),
      );
    }
    // ── Finance of each imported project (settings, entries, budget, custom categories).
    // Replaced from v1 on every import, unless someone already edited it in v2.
    const finance: (Parity & { name: string })[] = [];
    let financeSkipped = 0;
    for (const p of pr) {
      // Remember that this project's finance has been through the import, even when v1 had none.
      q.push(
        db
          .insert(legacyMap)
          .values({ kind: "finance", legacyId: p.id, newId: p.id })
          .onConflictDoNothing(),
      );
      const raw = ws.fin[p.id];
      if (!raw || typeof raw !== "object") continue;
      const editedInV2 =
        (
          await db
            .select({ id: projectFinance.projectId })
            .from(projectFinance)
            .where(
              and(
                eq(projectFinance.projectId, p.id),
                notLike(projectFinance.updatedBy, "v1-import%"),
              ),
            )
            .limit(1)
        ).length > 0 ||
        (
          await db
            .select({ id: financeEntries.id })
            .from(financeEntries)
            .where(
              and(
                eq(financeEntries.projectId, p.id),
                or(
                  notLike(financeEntries.updatedBy, "v1-import%"),
                  notLike(financeEntries.createdBy, "v1-import%"),
                ),
              ),
            )
            .limit(1)
        ).length > 0;
      if (editedInV2) {
        financeSkipped++;
        issues.push({
          kind: "project",
          id: p.id,
          name: p.name,
          severity: "fixed",
          reason: "المالية عُدّلت في الإصدار الثاني بعد الاستيراد، فلم تُستبدل",
        });
        continue;
      }
      const rows = planFinance(p.id, raw);
      finance.push({ ...financeParity(p.id, raw, rows), name: p.name });
      const ctrl = {
        ...rows.ctrl,
        opCats: JSON.stringify(rows.ctrl.opCats),
        updatedBy: by,
        updatedAt: t,
      };
      q.push(
        db.delete(financeEntries).where(eq(financeEntries.projectId, p.id)),
        db.delete(financeBudgetItems).where(eq(financeBudgetItems.projectId, p.id)),
        db.delete(financeCategories).where(eq(financeCategories.projectId, p.id)),
        db
          .insert(projectFinance)
          .values({
            projectId: p.id,
            orgId: me.orgId,
            ...ctrl,
            version: 1,
            createdBy: by,
            createdAt: t,
          })
          .onConflictDoUpdate({
            target: projectFinance.projectId,
            set: { ...ctrl, version: sql`${projectFinance.version} + 1` },
          }),
      );
      for (const k of rows.categories)
        q.push(db.insert(financeCategories).values({ ...k, projectId: p.id }));
      for (const b of rows.budget)
        q.push(db.insert(financeBudgetItems).values({ ...b, projectId: p.id }));
      for (const e of rows.entries)
        q.push(
          db.insert(financeEntries).values({
            ...e,
            orgId: me.orgId,
            projectId: p.id,
            createdBy: by,
            createdAt: t,
            updatedBy: by,
            updatedAt: t,
          }),
        );
    }

    // ── Contracts and letters of each imported project.
    const docs: {
      id: string;
      projectId: string;
      kind: string;
      title: string;
      number: string;
      status: string;
    }[] = [];
    let docsSkipped = 0;
    let withCover = 0;
    const imageCount = new Map<string, Map<string, number>>(); // header/footer/stamp → asset id → uses
    const assetFor = async (dataUrl: string, slot: "header" | "footer" | "stamp") => {
      if (!dataUrl || !c.env.FILES) return "";
      const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (ch) =>
        ch.charCodeAt(0),
      );
      const r = await storeAsset(db, c.env.FILES, me.orgId, me.id, bytes);
      if ("error" in r) return "";
      const m = imageCount.get(slot) ?? new Map<string, number>();
      m.set(r.id, (m.get(r.id) ?? 0) + 1);
      imageCount.set(slot, m);
      return r.id;
    };
    const takenNumbers = new Set(
      (
        await db
          .select({ n: documents.number })
          .from(documents)
          .where(eq(documents.orgId, me.orgId))
      ).map((r) => r.n),
    );
    for (const p of pr) {
      const raw = ws.fin[p.id];
      if (!raw || typeof raw !== "object") continue;
      for (const d of planDocuments(p.id, raw) as PlannedDoc[]) {
        const [existing] = await db
          .select({
            number: documents.number,
            updatedBy: documents.updatedBy,
            orgId: documents.orgId,
          })
          .from(documents)
          .where(eq(documents.id, d.id))
          .limit(1);
        if (
          existing &&
          (existing.orgId !== me.orgId || !existing.updatedBy.startsWith("v1-import"))
        ) {
          docsSkipped++;
          issues.push({
            kind: "project",
            id: p.id,
            name: `${p.name} — ${d.title}`,
            severity: "fixed",
            reason: "المستند عُدّل في الإصدار الثاني، فلم يُستبدل",
          });
          continue;
        }
        if (d.hadCover) withCover++;
        let number = existing?.number ?? "";
        if (!number) {
          if (d.v1Number && !takenNumbers.has(d.v1Number)) number = d.v1Number;
          else {
            const y = new Date().getUTCFullYear();
            number = formatCode(
              d.kind === "contract" ? "CT" : "LT",
              await reserve(db, me.orgId, `doc_${d.kind}`, y, 1),
              y,
            );
          }
          takenNumbers.add(number);
        }
        const layout = layoutSchema.parse({
          ...Object.fromEntries(Object.entries(d.layout).filter(([, v]) => v !== undefined)),
          headerAsset: await assetFor(d.images.header, "header"),
          footerAsset: await assetFor(d.images.footer, "footer"),
          stampAsset: await assetFor(d.images.stamp, "stamp"),
        });
        const row = {
          title: d.title,
          templateKey: d.templateKey,
          status: d.status,
          variables: JSON.stringify(d.variables),
          content: JSON.stringify(
            d.kind === "contract" ? renumberClauses(d.content, CONTRACT_ORDINALS) : d.content,
          ),
          layout: JSON.stringify(layout),
          approvedBy: d.status === "approved" ? by : "",
          approvedAt: d.status === "approved" ? (d.updatedAt ?? t) : null,
          updatedBy: by,
          updatedAt: d.updatedAt ?? t,
        };
        q.push(
          db
            .insert(documents)
            .values({
              id: d.id,
              orgId: me.orgId,
              projectId: p.id,
              kind: d.kind,
              number,
              ...row,
              createdBy: by,
              createdAt: d.updatedAt ?? t,
            })
            .onConflictDoUpdate({ target: documents.id, set: row }),
          db
            .insert(legacyMap)
            .values({ kind: "document", legacyId: d.id, newId: d.id })
            .onConflictDoNothing(),
        );
        if (d.status === "approved") {
          q.push(
            db
              .insert(documentVersions)
              .values({
                id: `dv_${d.id}`,
                documentId: d.id,
                version: 1,
                // Marker only: the stored row is the approved content (see share.ts approvedView).
                snapshot: JSON.stringify({
                  document: { id: d.id, projectId: p.id, kind: d.kind, number, title: d.title },
                  importedFromV1: true,
                }),
                approvedBy: by,
                approvedAt: d.updatedAt ?? t,
              })
              .onConflictDoNothing(),
          );
        }
        docs.push({
          id: d.id,
          projectId: p.id,
          kind: d.kind,
          title: d.title,
          number,
          status: d.status,
        });
      }
    }
    // The organisation has no letterhead/stamp yet: adopt the one v1 documents used most.
    const [profile] = await db
      .select()
      .from(orgProfile)
      .where(eq(orgProfile.orgId, me.orgId))
      .limit(1);
    const mostUsed = (slot: string) =>
      [...(imageCount.get(slot) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const adopt: Record<string, string> = {};
    if (!profile?.headerAsset && mostUsed("header")) adopt.headerAsset = mostUsed("header");
    if (!profile?.footerAsset && mostUsed("footer")) adopt.footerAsset = mostUsed("footer");
    if (!profile?.stampAsset && mostUsed("stamp")) adopt.stampAsset = mostUsed("stamp");
    if (Object.keys(adopt).length) {
      if (profile)
        q.push(
          db
            .update(orgProfile)
            .set({ ...adopt, version: profile.version + 1, updatedBy: by, updatedAt: t })
            .where(eq(orgProfile.orgId, me.orgId)),
        );
      else {
        const base = await loadOrgProfile(db, me.orgId);
        const { urls: _u, ...defaults } = base;
        q.push(
          db
            .insert(orgProfile)
            .values({
              ...defaults,
              ...adopt,
              orgId: me.orgId,
              version: 1,
              updatedBy: by,
              updatedAt: t,
            })
            .onConflictDoNothing(),
        );
      }
    }

    await runAll(db, q as never);

    return c.json({
      ok: true,
      clients: { created: newClients.length, updated: cl.length - newClients.length },
      projects: {
        created: pr.filter((p) => !existingProjects.has(p.id)).length,
        updated: pr.filter((p) => existingProjects.has(p.id)).length,
      },
      finance: { imported: finance.length, skipped: financeSkipped, parity: finance },
      documents: {
        imported: docs.length,
        skipped: docsSkipped,
        withCover,
        adoptedLetterhead: Object.keys(adopt),
        items: docs,
      },
      issues,
    });
  });
