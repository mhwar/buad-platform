import type { AppType } from "@buad/api/app";
import { hc } from "hono/client";

/** Fully typed client: request and response shapes come from the API itself. */
export const api = hc<AppType>("/");
