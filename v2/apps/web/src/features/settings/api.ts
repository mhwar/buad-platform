import type { OrgSettingsPatch, ProjectDefaults } from "@buad/schema/org";
import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type OrgSettings = {
  projectDefaults: ProjectDefaults;
  /** False while new projects use the platform's built-in defaults. */
  projectDefaultsSet: boolean;
  /** Year → revenue target in riyals with VAT. */
  targets: Record<string, number>;
  cashOpening: { amount: number; date: string; updatedBy: string; updatedAt: number } | null;
};

export const orgSettingsQuery = queryOptions({
  queryKey: ["org-settings"],
  queryFn: async () => ok<OrgSettings>(await fetch("/api/org/settings")),
  staleTime: 60_000,
});

export const saveOrgSettings = async (patch: OrgSettingsPatch) =>
  ok<OrgSettings>(
    await fetch("/api/org/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
