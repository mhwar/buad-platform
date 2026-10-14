import { products } from "@buad/schema/db";
import { productContent } from "@buad/schema/products";
import { and, eq } from "drizzle-orm";
import type { Db } from "../auth/service";

/**
 * Checks a project's «الخدمة والباقة» against the org's products and returns what to store.
 * A package needs its product; an unknown product or package is refused (never guessed).
 */
export async function resolveServiceLink(
  db: Db,
  orgId: string,
  productId: string,
  packageId: string,
): Promise<
  | { ok: true; productId: string; packageId: string; packageName: string }
  | { ok: false; error: "product_not_found" | "package_not_found" | "package_without_product" }
> {
  if (!productId)
    return packageId
      ? { ok: false, error: "package_without_product" }
      : { ok: true, productId: "", packageId: "", packageName: "" };
  const [prod] = await db
    .select({ content: products.content })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
    .limit(1);
  if (!prod) return { ok: false, error: "product_not_found" };
  if (!packageId) return { ok: true, productId, packageId: "", packageName: "" };
  let pkgs: { id: string; name: string }[] = [];
  try {
    pkgs = productContent.parse(JSON.parse(prod.content)).packages;
  } catch {
    // unreadable content: no packages to match
  }
  const pkg = pkgs.find((p) => p.id === packageId);
  return pkg
    ? { ok: true, productId, packageId, packageName: pkg.name }
    : { ok: false, error: "package_not_found" };
}
