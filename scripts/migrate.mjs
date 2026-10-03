/**
 * Applies supabase/migrations/0001_core.sql to a Supabase project.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... bun scripts/migrate.mjs
 *
 * The splitter understands dollar-quoted bodies ($$ ... $$) and single
 * quotes, so a semicolon inside a function body never splits a statement.
 * That is the whole reason this exists instead of `sql.split(';')`.
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

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!REF || !TOKEN) {
  console.error(
    "Set SUPABASE_PROJECT_REF=<ref> and SUPABASE_ACCESS_TOKEN=sbp_...\n" +
      "Neither value is read from .env — pass them on the command line.",
  );
  process.exit(1);
}

const sql = await Bun.file("supabase/migrations/0001_core.sql").text();
const statements = splitStatements(sql);
console.log(`Parsed ${statements.length} statements.`);

const url = `https://api.supabase.com/v1/projects/${REF}/database/query`;
let applied = 0;

for (const [index, statement] of statements.entries()) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: statement }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(
      `\nFAILED at statement ${index + 1}/${statements.length}:\n${statement
        .slice(0, 300)
        .trim()}\n\nServer said:\n${body}`,
    );
    process.exit(1);
  }
  applied++;
  console.log(`  ${String(applied).padStart(3)}/${statements.length} ok`);
}

console.log(`\nAll ${applied} statements applied.`);