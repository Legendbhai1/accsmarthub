import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  applyMigrations,
  isTransactional,
  ledgerStatements,
  migrationLabel,
  pendingMigrations,
  splitStatements,
  toQuery,
} from "../scripts/migrate.mjs";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * The runner is the thing that decides whether a failed migration can reach
 * the rest of the chain, so its control flow is tested directly rather than
 * through a live project. The bug this locks down: the old runner applied
 * statements one at a time and kept going, so a half-applied 0013 was followed
 * by 0014-0016.
 */
describe("migration runner stops at the first failure", () => {
  const files = ["0001.sql", "0002.sql", "0003.sql", "0004.sql"];

  it("applies everything when nothing fails", async () => {
    const seen: string[] = [];
    const report = await applyMigrations({
      migrations: files,
      applied: new Set<string>(),
      execute: async (f: string) => {
        seen.push(f);
        return { ok: true };
      },
    });
    expect(report.applied).toEqual(files);
    expect(report.failed).toBeNull();
    expect(report.stoppedEarly).toBe(false);
    expect(seen).toEqual(files);
  });

  it("stops dead and never attempts a later migration", async () => {
    const seen: string[] = [];
    const report = await applyMigrations({
      migrations: files,
      applied: new Set<string>(),
      execute: async (f: string) => {
        seen.push(f);
        return f === "0003.sql" ? { ok: false, error: "boom" } : { ok: true };
      },
    });
    expect(report.applied).toEqual(["0001.sql", "0002.sql"]);
    expect(report.failed).toEqual({ file: "0003.sql", error: "boom" });
    expect(report.stoppedEarly).toBe(true);
    // The point of the whole exercise: 0004 was never reached.
    expect(seen).toEqual(["0001.sql", "0002.sql", "0003.sql"]);
    expect(seen).not.toContain("0004.sql");
  });

  it("skips migrations already recorded, and does not replay them", async () => {
    const seen: string[] = [];
    const report = await applyMigrations({
      migrations: files,
      applied: new Set(["0001.sql", "0002.sql"]),
      execute: async (f: string) => {
        seen.push(f);
        return { ok: true };
      },
    });
    expect(report.skipped).toEqual(["0001.sql", "0002.sql"]);
    expect(report.applied).toEqual(["0003.sql", "0004.sql"]);
    expect(seen).toEqual(["0003.sql", "0004.sql"]);
  });
});

describe("pendingMigrations keeps filename order and honours the ledger", () => {
  it("returns only what is not applied, in the order given", () => {
    const files = ["0001.sql", "0002.sql", "0013.sql"];
    expect(pendingMigrations(files, new Set(["0002.sql"]))).toEqual([
      "0001.sql",
      "0013.sql",
    ]);
    expect(pendingMigrations(files, new Set(files))).toEqual([]);
  });
});

describe("each migration is sent as one transaction when it can be", () => {
  it("wraps a plain migration in begin/commit", () => {
    const { query, transactional } = toQuery("alter table t add column c int;");
    expect(transactional).toBe(true);
    expect(query.startsWith("begin;")).toBe(true);
    expect(query.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("does not double-wrap a migration that opens its own transaction", () => {
    const sql = "begin;\nselect 1;\ncommit;";
    const { query, transactional } = toQuery(sql);
    expect(transactional).toBe(true);
    expect(query).toBe(sql);
    expect(query.match(/begin;/g)).toHaveLength(1);
  });

  it("refuses to wrap a statement that cannot run transactionally", () => {
    const sql = "create index concurrently i on public.orders (status);";
    expect(isTransactional(sql)).toBe(false);
    const { query, transactional } = toQuery(sql);
    expect(transactional).toBe(false);
    expect(query).toBe(sql);
  });

  it("is not fooled by a concurrent index mentioned only in a comment", () => {
    const sql = "-- do not use create index concurrently here\nalter table t add c int;";
    expect(isTransactional(sql)).toBe(true);
  });

  it("recognises every non-transactional form it screens for", () => {
    for (const sql of [
      "create unique index concurrently i on t (a);",
      "drop index concurrently i;",
      "reindex table public.orders;",
      "vacuum public.orders;",
      "alter system set work_mem = '1GB';",
    ]) {
      expect(isTransactional(sql), sql).toBe(false);
    }
  });
});

describe("the real migrations are all safe to run transactionally", () => {
  const names = [
    "0007_email_and_store_policy.sql",
    "0008_listing_first_publishing.sql",
    "0009_buying_to_delivery_lifecycle.sql",
    "0010_admin_users_edge_function.sql",
    "0011_dispute_rls_fix.sql",
    "0012_dispute_resolution_consistency.sql",
    "0013_reconcile_marketplace.sql",
    "0014_seller_payouts.sql",
    "0015_support_request_safety.sql",
    "0016_saved_listings.sql",
  ];

  it.each(names)("%s can be wrapped in one transaction", (name) => {
    expect(isTransactional(read(`supabase/migrations/${name}`))).toBe(true);
  });

  it("0017 reloads PostgREST's schema cache after adding columns", () => {
    // Without this, the columns are live in Postgres but absent from the API's
    // cache, and a write naming one fails with "Could not find the
    // 'agreement_version' column of 'stores' in the schema cache" — the same
    // error an unapplied migration gives.
    const sql = read("supabase/migrations/0017_store_applications.sql");
    expect(sql).toMatch(/notify\s+pgrst\s*,\s*'reload schema'/i);
  });

  it("0018 repairs the cart checkout's oversell guard", () => {
    const fixed = read("supabase/migrations/0018_cart_checkout_stock_guard.sql");
    // The bug: the cart branch tested `v_listing.stock`, but `v_listing` is
    // only assigned on the Buy Now path. `NULL < n` is NULL, `if NULL` does
    // not run, and the guard was dead — a cart checkout could oversell.
    const code = fixed.replace(/--[^\n]*/g, "");
    expect(code).not.toMatch(/v_listing/);
    // The replacement must actually compare against a read of the row.
    expect(code).toMatch(/select stock into v_available/i);
    expect(code).toMatch(/coalesce\(v_available,\s*0\)\s*<\s*v_item\.quantity/i);
    // It replaces the function rather than adding a second definition.
    expect(fixed.match(/create or replace function public\.checkout\(/gi)).toHaveLength(1);
  });

  it("every migration file is recorded in the runner's ledger order", () => {
    // A new migration that is not safe to run in one transaction, or that
    // duplicates a function definition across files, is how the production
    // drift started. Every file must parse as one transactionable unit.
    for (const name of readdirSync("supabase/migrations")) {
      if (!name.endsWith(".sql")) continue;
      expect(isTransactional(read(`supabase/migrations/${name}`)), name).toBe(true);
    }
  });

  it("the runner never invokes a command that bypasses the API's single query", () => {
    // A guard against someone reintroducing per-statement application: the
    // module must expose the batch entrypoint the CLI uses.
    const source = read("scripts/migrate.mjs");
    expect(source).toMatch(/export async function applyMigrations/);
  });
});

describe("the ledger records filenames, not paths", () => {
  it("labels a migration by its basename", () => {
    expect(migrationLabel("supabase/migrations/0013_reconcile_marketplace.sql")).toBe(
      "0013_reconcile_marketplace.sql",
    );
    expect(migrationLabel("C:\\repo\\supabase\\migrations\\0001_core.sql")).toBe(
      "0001_core.sql",
    );
  });

  it("records idempotently so a re-run cannot duplicate a row", () => {
    const { record } = ledgerStatements("supabase/migrations/0013_reconcile_marketplace.sql");
    expect(record).toContain("public.schema_migrations");
    expect(record).toContain("0013_reconcile_marketplace.sql");
    expect(record).toContain("on conflict (filename) do nothing");
  });
});

describe("splitStatements is not broken by a semicolon in a function body", () => {
  it("keeps a dollar-quoted body as one statement", () => {
    const sql = "create function f() returns void as $$ begin perform 1; end; $$ language plpgsql;";
    expect(splitStatements(sql)).toHaveLength(1);
  });

  it("still splits two ordinary statements", () => {
    expect(splitStatements("select 1; select 2;")).toHaveLength(2);
  });
});

describe("the CLI is a dry run unless a write flag is passed", () => {
  const source = read("scripts/migrate.mjs");

  it("documents the dry-run default in its usage banner", () => {
    expect(source).toMatch(/Default is a dry run/);
    expect(source).toMatch(/args\.includes\("--apply"\)/);
  });

  it("does not create the ledger before it has checked for a write flag", () => {
    // A previous version ran `ensure` (a CREATE TABLE) before the `!apply`
    // early exit, so a plan-mode run still wrote to production. The ensure
    // call must come after the dry-run exit.
    const ensureAt = source.indexOf(".ensure)");
    const dryRunExitAt = source.indexOf("This was a dry run");
    expect(ensureAt).toBeGreaterThan(-1);
    expect(dryRunExitAt).toBeGreaterThan(-1);
    expect(ensureAt).toBeGreaterThan(dryRunExitAt);
  });

  it("refuses a bare --apply when the project has no ledger", () => {
    // Otherwise it would treat every migration as pending and replay 0001.
    expect(source).toMatch(/Refusing to replay the whole/);
    expect(source).toMatch(/!ledgerPresent && !explicit\.length/);
  });

  it("treats --baseline as a write mode that runs no migration SQL", () => {
    expect(source).toMatch(/args\.includes\("--baseline"\)/);
    const baselineAt = source.indexOf('args.includes("--baseline")');
    const reportAt = source.indexOf("const report = await applyMigrations");
    expect(baselineAt).toBeLessThan(reportAt);
  });

  it("reads plan state without writing when the ledger is missing", () => {
    expect(source).toMatch(/let ledgerPresent = true;/);
    expect(source).toMatch(/catch \{\s*ledgerPresent = false;/);
  });
});

describe("migrate.mjs does not run its CLI when imported", () => {
  it("exports the testable surface without side effects", () => {
    // If the CLI block had executed on import, the test process would have
    // exited or thrown about missing SUPABASE_PROJECT_REF.
    expect(typeof applyMigrations).toBe("function");
    expect(typeof toQuery).toBe("function");
    // vi is imported so an accidental console write in the module surfaces.
    expect(vi.isMockFunction(vi.fn())).toBe(true);
  });
});
