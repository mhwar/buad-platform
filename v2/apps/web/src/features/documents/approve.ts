import type { QueryClient } from "@tanstack/react-query";
import { confirmAction } from "../../components/ui";
import { IDENTITY_FIELDS, missingFields } from "../org/completeness";
import { orgProfileQuery } from "../org/OrgSettings";

/**
 * Asks before approving a document, and names the organisation fields still empty: an approved
 * contract is locked, and those fields would print as «............».
 */
export async function confirmApprove(qc: QueryClient): Promise<boolean> {
  const gaps = await qc
    .fetchQuery(orgProfileQuery)
    .then((p) => missingFields(p, IDENTITY_FIELDS))
    .catch(() => [] as string[]);
  return confirmAction(
    gaps.length
      ? {
          title: "بيانات الجهة ناقصة",
          text: `لم تُدخل بعد: ${gaps.join("، ")}. ستظهر في المستند المعتمد نقاطاً فارغة. أكملوها من «الإعدادات ← بيانات الجهة»، أو اعتمدوا المستند كما هو.`,
          action: "اعتماد كما هو",
        }
      : { title: "اعتماد المستند؟", text: "يُقفل عن التعديل وتُحفظ نسخة منه.", action: "اعتماد" },
  );
}
