import {
  CLIENT_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
} from "@buad/schema/clients";
import type { Tone } from "../components/ui";

export { CLIENT_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS };
/** Same colour meaning as v1 (app.html L3757). */
export const STATUS_TONE: Record<string, Tone> = {
  draft: "gray",
  active: "green",
  completed: "blue",
  paused: "amber",
  cancelled: "red",
};
export const label = <T extends string>(map: Record<T, string>, k: string) => map[k as T] ?? k;
