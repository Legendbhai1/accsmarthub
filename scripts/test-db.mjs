#!/usr/bin/env node
/**
 * Runs a multi-statement SQL test file against a Supabase project in ONE
 * session, so temp tables and BEGIN/ROLLBACK work.
 *
 * `scripts/migrate.mjs` splits the file into individual statements, which
 * drops temp tables between them — fine for DDL migrations, wrong for tests.
 *
 * Usage:
 *   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=<pat> \
 *     bun scripts/test-db.mjs tests/settlement.sql
 */
import { readFile } from "node:fs/promises";

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const file = process.argv[2];

if (!ref || !token) {
  console.error("Set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN.");
  process.exit(2);
}
if (!file) {
  console.error("Usage: bun scripts/test-db.mjs <path.sql>");
  process.exit(2);
}

const query = await readFile(file, "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`FAILED (HTTP ${res.status}):\n${text}`);
  process.exit(1);
}

// The Management API returns only the final result set, so the test file
// folds its detail rows and totals into one set.
let rows;
try {
  rows = JSON.parse(text);
} catch {
  console.log(text);
  process.exit(0);
}

if (!Array.isArray(rows) || rows.length === 0) {
  console.log("(no result set — did the script end without a SELECT?)");
  process.exit(1);
}

const flat = rows.flat();
const summary = flat.find((r) => r && "total" in r);

// Postgres booleans can arrive as true/"true"/"t"/1 depending on the driver.
const bool = (v) => v === true || v === 1 || v === "true" || v === "t";

for (const r of flat) {
  if (!r || !("name" in r)) continue;
  const skipped = typeof r.detail === "string" && r.detail.startsWith("SKIPPED");
  const mark = skipped ? "SKIP" : bool(r.passed) ? "PASS" : "FAIL";
  const extra = r.detail ? `  [${r.detail}]` : "";
  console.log(`${mark}  ${r.name}${extra}`);
}

if (!summary) {
  console.log("\n(no summary row produced)");
  process.exit(1);
}

const skipped = flat.filter(
  (r) => r && typeof r.detail === "string" && r.detail.startsWith("SKIPPED"),
).length;
const realFailures = Number(summary.fail_count) - skipped;

console.log(
  `\n${summary.pass_count}/${summary.total} passed, ${summary.fail_count} failed, ${skipped} skipped`,
);
if (skipped > 0) {
  console.log(`WARNING: ${skipped} test(s) did not run — treat as unverified, not passing.`);
}
process.exit(realFailures > 0 ? 1 : 0);
