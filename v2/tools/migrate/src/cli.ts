#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planMigration, toReport, toSql } from "./index";

/** buad-migrate <v1-snapshot.json> <out-dir>   — reads one file, writes import.sql + report.md. Touches nothing else. */
const [input, outDir = "out"] = process.argv.slice(2);
if (!input) {
  console.error("usage: buad-migrate <v1-snapshot.json> [out-dir]");
  process.exit(2);
}
const plan = planMigration(JSON.parse(readFileSync(input, "utf8")));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "import.sql"), `${toSql(plan).join("\n")}\n`);
writeFileSync(join(outDir, "report.md"), toReport(plan));
console.log(
  `orgs=${plan.orgs.length} users=${plan.users.length} rejected=${plan.rejects.length} → ${outDir}/import.sql, report.md`,
);
