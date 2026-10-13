import { z } from "zod";

export const roleSchema = z.enum(["owner", "admin", "member"]);
export type Role = z.infer<typeof roleSchema>;

const emailField = z.string().trim().toLowerCase().pipe(z.email());

export const loginInput = z.object({
  email: emailField,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInput>;

export const healthResponse = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponse>;

export const setPasswordInput = z.object({
  setupToken: z.string().min(1),
  password: z.string().min(8).max(200),
});
export type SetPasswordInput = z.infer<typeof setPasswordInput>;
