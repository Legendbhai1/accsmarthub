/**
 * Applies Supabase migrations to a project, in order, one at a time, and stops
 * dead on the first failure.
 *
 *   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \
 *     node scripts/migrate.mjs                 # PLAN: print what would run
 *     node scripts/migrate.mjs --apply         # apply every pending migration
 *     node scripts/migrate.mjs --apply supabase/migrations/0013_....sql
 *     node scripts/migrate.mjs --baseline      # record the chain as applied
 *
 * Default is a dry run. Nothing is written to the database unless `--apply`
 * (or `--baseline`) is passed, so an accidental invocation cannot migrate
 * production — not even the ledger table is created.
 *
 * `--baseline` is for a project that was migrated by hand, where 0001-0006 are
 * live but there is no ledger. It writes ledger rows only and runs no SQL from
 * the migration files.
 *
 * `--apply` with no file arguments requires an existing ledger; without one it
 * refuses rather than replaying 0001-0006.
 *
 * Why this shape
 * --------------
 * The previous version applied statements one at a time through the Management
 * API, each in its own implicit transaction. A migration that failed halfway
 * therefore left the objects it had already created committed, while the rest
 * never ran — and the script still reported success for the statements that
 * went through. That is how `0013` can be "not applied" and yet have its
 * `order_events` and `order_refunds` tables live in production.
 *
 * This version:
 *   * sends each migration as ONE query, wrapped in an explicit
 *     `begin; ... commit;` when the file is safe to run transactionally, so a
 *     failure rolls the whole file back;
 *   * refuses to continue to the next file after a failure — there is no path
 *     that reaches 0014-0016 once 0013 has failed;
 *   * reports, per migration, whether it applied, was already applied, or
 *     failed, and never claims a failed migration changed nothing;
 *   * records applied migrations in `public.schema_migrations` and skips them
 *     on the next run, so a non-idempotent migration (0001, 0005, 0009, 0012)
 *     is never blindly replayed.
 */

/** Split a Postgres script into individual statements. */
export function splitStatements(sql) {
  const out = [];
  let buf = "";
  let i = 0;
  // Tracks whether we are inside $$ ... $$ or a '...' / "..." literal.
  let dollarTag = null;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      buf += c;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        buf += c + next;
        i += 2;
        continue;
      }
      buf += c;
      i++;
      continue;
    }
    if (dollarTag) {
      if (c === "$" && sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += c;
      i++;
      continue;
    }
    if (inSingle) {
      buf += c;
      i++;
      if (c === "'") {
        if (sql[i] === "'") {
          buf += "'";
          i++;
        } else {
          inSingle = false;
        }
      }
      continue;
    }
    if (inDouble) {
      buf += c;
      i++;
      if (c === '"') {
        if (sql[i] === '"') {
          buf += '"';
          i++;
        } else {
          inDouble = false;
        }
      }
      continue;
    }

    // Normal state.
    if (c === "-" && next === "-") {
      inLineComment = true;
      buf += c + next;
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      buf += c + next;
      i += 2;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      buf += c;
      i++;
      continue;
    }
    if (c === '"') {
      inDouble = true;
      buf += c;
      i++;
      continue;
    }
    if (c === "$") {
      const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (c === ";") {
      i++;
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = "";
      continue;
    }
    buf += c;
    i++;
  }

  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Statements that cannot run inside a transaction. A migration containing one
 * is sent unwrapped, and the runner says so rather than pretending the file is
 * atomic. None of the current migrations contain any of these.
 */
const NON_TRANSACTIONAL = [
  /\bcreate\s+(?:unique\s+)?index\s+concurrently\b/i,
  /\bdrop\s+index\s+concurrently\b/i,
  /\breindex\b/i,
  /\bvacuum\b/i,
  /\bcreate\s+database\b/i,
  /\bdrop\s+database\b/i,
  /\balter\s+system\b/i,
  /\bcreate\s+subscription\b/i,
];

/** Strip `--` line comments so a comment cannot trip the scan above. */
function stripLineComments(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

export function isTransactional(sql) {
  const body = stripLineComments(sql);
  return !NON_TRANSACTIONAL.some((re) => re.test(body));
}

/**
 * Wraps a migration body so the whole file is one transaction, unless the file
 * already manages its own transaction (0011 does) or cannot be wrapped.
 */
export function toQuery(sql) {
  if (!isTransactional(sql)) return { query: sql, transactional: false };
  if (/^\s*(begin|start\s+transaction)\s*;/im.test(sql)) {
    return { query: sql, transactional: true };
  }
  return { query: `begin;\n${sql}\ncommit;`, transactional: true };
}

/** The migrations that still need applying, in filename order. */
export function pendingMigrations(files, applied) {
  return files.filter((f) => !applied.has(f));
}

export const LEDGER_TABLE = "public.schema_migrations";

const LEDGER_DDL = `create table if not exists ${LEDGER_TABLE} (
  filename text primary key,
  applied_at timestamptz not null default now()
);
alter table ${LEDGER_TABLE} enable row level security;`;

/**
 * Applies migrations through an injected `execute(sql) -> Promise<{ok, error}>`
 * so the ordering, stop-on-failure and reporting logic can be tested without a
 * live project. Returns a structured report; it never throws for a migration
 * failure, because the caller needs the partial-application facts.
 */
export async function applyMigrations({ migrations, applied, execute }) {
  const report = { applied: [], skipped: [], failed: null, stoppedEarly: false };
  const done = new Set(applied);

  for (const file of migrations) {
    if (done.has(file)) {
      report.skipped.push(file);
      continue;
    }
    const result = await execute(file);
    if (!result.ok) {
      // Stop here. Everything after this file is untouched, and the caller is
      // told which files were attempted so it can re-check the database.
      report.failed = { file, error: result.error ?? "unknown error" };
      report.stoppedEarly = true;
      return report;
    }
    done.add(file);
    report.applied.push(file);
  }
  return report;
}

/** Filename only, for ledger rows and console output. */
export function migrationLabel(file) {
  return file.split(/[\\/]/).pop();
}

/** The ledger statements a runner issues around one migration. */
export function ledgerStatements(file) {
  return {
    ensure: LEDGER_DDL,
    record: `insert into ${LEDGER_TABLE} (filename) values ('${migrationLabel(file)}')
               on conflict (filename) do nothing`,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedDirectly =
  typeof process !== "undefined" &&
  Boolean(process.argv[1]) &&
  /scripts[\\/]migrate\.mjs$/.test(process.argv[1]);

if (invokedDirectly) {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join, resolve } = await import("node:path");

  const REF = process.env.SUPABASE_PROJECT_REF;
  const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

  const args = process.argv.slice(2);
  const baseline = args.includes("--baseline");
  const apply = args.includes("--apply") || baseline;
  const explicit = args.filter((a) => !a.startsWith("--"));

  if (!REF || !TOKEN) {
    console.error(
      "Set SUPABASE_PROJECT_REF=<ref> and SUPABASE_ACCESS_TOKEN=sbp_...\n" +
        "Neither value is read from .env — pass them on the command line.",
    );
    process.exit(2);
  }

  const dir = resolve("supabase/migrations");
  const allFiles = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(dir, f));
  const migrations = explicit.length ? explicit.map((f) => resolve(f)) : allFiles;

  const url = `https://api.supabase.com/v1/projects/${REF}/database/query`;
  const post = async (sql) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    return { ok: res.ok, body: await res.text() };
  };
  const query = async (sql) => {
    const { ok, body } = await post(sql);
    if (!ok) throw new Error(body);
    return JSON.parse(body);
  };

  // In plan mode nothing may be written — not even the ledger table. A
  // previous version created it before checking `--apply`, which meant an
  // accidental invocation still wrote to production. If the ledger is absent,
  // fall back to reporting what the database already looks like rather than
  // assuming a clean project.
  let appliedSet = new Set();
  let ledgerPresent = true;
  try {
    const rows = await query(`select filename from ${LEDGER_TABLE}`);
    appliedSet = new Set(rows.map((r) => r.filename));
  } catch {
    ledgerPresent = false;
  }

  const todo = ledgerPresent ? pendingMigrations(migrations, appliedSet) : migrations;

  if (!apply) {
    console.log(`Migrations in ${dir}: ${migrations.length}`);
    if (!ledgerPresent) {
      console.log(
        `  (no ${LEDGER_TABLE} ledger in this project — showing what a run would\n` +
          "   attempt; applying will create the ledger and start from the first file)",
      );
    }
    for (const f of migrations) {
      console.log(`  ${appliedSet.has(f) ? "applied" : "PENDING"}  ${migrationLabel(f)}`);
    }
    console.log(
      `\n${todo.length} pending. This was a dry run; nothing was written.` +
        `\nRe-run with --apply to migrate.`,
    );
    process.exit(0);
  }

  // The ledger is the runner's own bookkeeping, not a numbered migration. It
  // is created only now that `--apply` has been given.
  if (!ledgerPresent && !explicit.length) {
    console.error(
      `No ${LEDGER_TABLE} ledger exists in this project, so the runner cannot\n` +
        "tell which migrations are already applied. Refusing to replay the whole\n" +
        "chain — on a project that already has 0001-0006 that would re-run them.\n\n" +
        "Either name the migrations to apply, e.g.\n" +
        "  node scripts/migrate.mjs --apply supabase/migrations/0013_*.sql \\\n" +
        "                                  supabase/migrations/0014_*.sql\n" +
        "or seed the ledger first with --baseline (records the current chain as\n" +
        "applied without running anything).",
    );
    process.exit(2);
  }
  await query(ledgerStatements(migrations[0] ?? "").ensure);

  // --baseline records the chain as already applied without running it. It
  // exists for a project migrated by hand, where 0001-0006 are live but the
  // ledger is empty; it writes ledger rows only.
  if (args.includes("--baseline")) {
    for (const f of migrations) {
      await post(ledgerStatements(f).record);
    }
    console.log(`Recorded ${migrations.length} migrations as applied (baseline).`);
    process.exit(0);
  }

  const report = await applyMigrations({
    migrations: todo,
    applied: appliedSet,
    execute: async (file) => {
      const sql = readFileSync(file, "utf8");
      const { query: wrapped, transactional } = toQuery(sql);
      console.log(
        `\n${migrationLabel(file)}  ${transactional ? "(in one transaction)" : "(NOT transactional — statements commit as they run)"}`,
      );
      const { ok, body } = await post(wrapped);
      if (ok) {
        await post(ledgerStatements(file).record);
        // PostgREST caches the schema, so a migration that adds a column or a
        // table is invisible to the API — the client keeps getting "column X
        // does not exist in the schema cache" — until the cache is reloaded.
        // Newer migration files ask for this themselves, but the older ones do
        // not, so the runner asks once per applied file. A failed reload must
        // not fail the migration: the DDL already committed.
        const reload = await post("notify pgrst, 'reload schema';");
        console.log(
          reload.ok
            ? "  applied (schema cache reloaded)"
            : "  applied (schema cache reload request failed — reload it from the dashboard if the API still reports missing columns)",
        );
        return { ok: true };
      }
      console.error(`  FAILED:\n${body}`);
      return { ok: false, error: body };
    },
  });

  console.log("\n================ SUMMARY ================");
  for (const f of report.skipped) console.log(`  already applied  ${migrationLabel(f)}`);
  for (const f of report.applied) console.log(`  applied          ${migrationLabel(f)}`);
  if (report.failed) {
    console.log(`  FAILED           ${migrationLabel(report.failed.file)}`);
    console.log(
      "\nStopped at the first failure. No later migration was attempted.\n" +
        "A failed migration may still have committed some statements if it was\n" +
        "not transactional; inspect the database before re-running.",
    );
    process.exit(1);
  }
  console.log(
    `\n${report.applied.length} applied, ${report.skipped.length} already current.`,
  );
}
