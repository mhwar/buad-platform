import { z } from "zod";

/**
 * A PATCH body from an input shape: every field optional and, unlike `.partial()`, with no default.
 * (In zod 4 a default still fires inside `.partial()`, so an omitted field would silently reset to
 * its default value on update.)
 */
export function patchOf<S extends z.ZodRawShape>(shape: S) {
  const out: Record<string, z.ZodType> = {};
  for (const [k, v] of Object.entries(shape)) {
    const inner = (v instanceof z.ZodDefault ? v.unwrap() : v) as z.ZodType;
    out[k] = (inner as z.ZodString).optional();
  }
  return z.object(out) as unknown as z.ZodObject<{
    [K in keyof S]: z.ZodOptional<S[K] extends z.ZodDefault<infer I> ? I : S[K]>;
  }>;
}
