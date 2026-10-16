import type { ReviewFlag } from "@buad/domain";
import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type ReviewItem = {
  id: string;
  number: string;
  name: string;
  status: string;
  clientId: string;
  clientName: string;
  contractDate: string;
  startDate: string;
  estimated: boolean;
  gross: number;
  received: number;
  receivedYear: number;
  remaining: number;
  lastReceipt: string;
  overdueLines: number;
  pendingLines: number;
  flags: ReviewFlag[];
};
export type YearReview = {
  year: number;
  totals: {
    revenue: number;
    target: number | null;
    projectReceipts: number;
    receiptsVat: number;
    companyIncome: number;
    unrecorded: number;
    collecting: number;
  };
  counts: Record<ReviewFlag, number>;
  items: ReviewItem[];
};

export const yearReviewQuery = (year: number) =>
  queryOptions({
    queryKey: ["year-review", year],
    queryFn: async () => ok<YearReview>(await fetch(`/api/finance/year-review?year=${year}`)),
  });
