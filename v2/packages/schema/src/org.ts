import { z } from "zod";

const s = (max = 200) => z.string().trim().max(max);
export const orgProfileFields = {
  name: s(),
  email: s(),
  phone: s(40),
  website: s(),
  address: s(300),
  reg: s(40),
  tax: s(40),
  signerName: s(),
  signerTitle: s(),
  signerId: s(40),
  bankName: s(),
  bankIban: s(40),
  logoAsset: s(64),
  stampAsset: s(64),
  signatureAsset: s(64),
  headerAsset: s(64),
  footerAsset: s(64),
};
export const orgProfilePatch = z
  .object(orgProfileFields)
  .partial()
  .extend({ version: z.number().int().min(0) });
export type OrgProfilePatch = z.input<typeof orgProfilePatch>;
export const ASSET_MIME = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const MAX_ASSET_BYTES = 2 * 1024 * 1024;
