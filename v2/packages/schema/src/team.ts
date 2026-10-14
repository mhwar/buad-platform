import { z } from "zod";

const emailField = z.string().trim().toLowerCase().pipe(z.email());
const roleKey = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{1,39}$/);

export const userInvite = z.object({
  email: emailField,
  name: z.string().trim().min(1).max(100),
  roleKey,
});
export type UserInvite = z.infer<typeof userInvite>;

export const userPatch = z
  .object({
    name: z.string().trim().min(1).max(100),
    roleKey,
    active: z.boolean(),
  })
  .partial();
export type UserPatch = z.infer<typeof userPatch>;

export const roleSave = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(240).default(""),
  perms: z.array(z.string().max(60)).max(80),
  scopes: z.object({ projects: z.enum(["all", "team", "mine"]).optional() }).default({}),
});
export type RoleSave = z.infer<typeof roleSave>;

export const roleCreate = roleSave.extend({ key: roleKey });

export const auditQuery = z.object({
  entity: z.string().max(40).optional(),
  user: z.string().max(60).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: z.coerce.number().int().optional(),
});
