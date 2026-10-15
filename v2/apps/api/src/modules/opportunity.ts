import { normalizeName, STAGE_LABEL, type Stage } from "@buad/domain";
import { clients, crmActivities, productRequests } from "@buad/schema/db";
import { eq } from "drizzle-orm";
import type { Db } from "../auth/service";
import { findSimilarName, insertClient } from "./clients";
import { newId, nowSec } from "./common";

type Req = typeof productRequests.$inferSelect;
type Me = { id: string; orgId: string; name: string };

/** A client made from an opportunity's contact details: a prospect until something is won. */
export async function clientFromLead(
  db: Db,
  me: Me,
  lead: { name: string; entity: string; phone: string; email: string },
  note: string,
) {
  return (
    await insertClient(db, me, {
      name: lead.entity || lead.name,
      type: "association",
      email: lead.email,
      phone: lead.phone,
      city: "",
      regNo: "",
      taxNo: "",
      address: "",
      website: "",
      notes: note,
      logo: "",
      signatoryName: "",
      signatoryTitle: "",
      contacts:
        lead.entity && lead.name
          ? [{ name: lead.name, title: "", phone: lead.phone, email: lead.email }]
          : [],
      confirmSimilarName: true,
    } as Parameters<typeof insertClient>[2])
  ).id;
}

/**
 * Every opportunity belongs to a client: the first time someone works on one that came without
 * (a website enquiry), it is linked to the client with the same name, or a new one is made.
 */
export async function ensureClient(db: Db, me: Me, row: Req): Promise<string> {
  if (row.clientId) return row.clientId;
  const similar = await findSimilarName(db, me.orgId, normalizeName(row.entity || row.name));
  const clientId =
    similar?.id ?? (await clientFromLead(db, me, row, "أُنشئ تلقائياً عند أول تواصل مع فرصة"));
  await db.update(productRequests).set({ clientId }).where(eq(productRequests.id, row.id));
  row.clientId = clientId;
  return clientId;
}

/** Moves an opportunity to another stage, stamps when, and writes the move into its client's log. */
export async function moveStage(db: Db, me: Me, row: Req, to: Stage, extra: Partial<Req> = {}) {
  const t = nowSec();
  const moved = row.status !== to;
  await db
    .update(productRequests)
    .set({
      ...extra,
      status: to,
      ...(moved ? { stageChangedAt: t } : {}),
      updatedBy: me.id,
      updatedAt: t,
    })
    .where(eq(productRequests.id, row.id));
  if (moved && row.clientId)
    await db.insert(crmActivities).values({
      id: newId("act"),
      orgId: me.orgId,
      clientId: row.clientId,
      requestId: row.id,
      type: "stage",
      summary: `من «${STAGE_LABEL[row.status]}» إلى «${STAGE_LABEL[to]}»${to === "lost" && extra.lostReason ? ` — ${extra.lostReason}` : ""}`,
      at: t,
      createdBy: me.id,
      createdByName: me.name,
    });
  return moved;
}

/** Touches the client's «last contact» when a contact is logged against one of its opportunities. */
export async function touchClient(db: Db, clientId: string, at: number) {
  const [c] = await db
    .select({ last: clients.lastContactAt })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (c)
    await db
      .update(clients)
      .set({ lastContactAt: Math.max(c.last, at), updatedAt: nowSec() })
      .where(eq(clients.id, clientId));
}
