/** Shared enum values. Kept free of drizzle so the web bundle can import them cheaply. */
export const CLIENT_TYPES = [
  "company",
  "association",
  "government",
  "individual",
  "other",
] as const;
export const PROJECT_TYPES = ["training", "consulting", "event", "other"] as const;
export const PROJECT_STATUSES = ["draft", "active", "completed", "paused", "cancelled"] as const;
