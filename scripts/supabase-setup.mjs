/**
 * One-time project setup for AccsMartHub, over the Supabase Management API.
 *
 * Everything this project needs changed at the project level lives here, because
 * none of it can be done from the client bundle:
 *
 *   1. smtp      -> point Supabase Auth email at Resend instead of Supabase's
 *                   built-in SMTP (this is what makes verification/sign-in mail
 *                   come from your own domain instead of @supabase.com)
 *   2. templates -> upload the branded HTML from supabase/email-templates/
 *   3. secrets   -> set the OxaPay merchant key + mode flag as Edge Function
 *                   secrets (never as VITE_ vars, never in the database)
 *   4. deploy    -> push create-deposit-invoice and oxapay-webhook
 *   5. promote   -> grant is_admin to one profile
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... \
 *   RESEND_SMTP_PASSWORD=re_... RESEND_ADMIN_EMAIL=you@yourdomain \
 *   OXAPAY_MERCHANT_API_KEY=... OXAPAY_SANDBOX=true \
 *     node scripts/supabase-setup.mjs --dry-run
 *
 *   ... then the same command without --dry-run, plus:
 *     --promote you@yourdomain   grant admin (prints the row it matched)
 *     --only smtp,deploy         run a subset of steps
 *
 * No secret is ever written to disk, logged, or passed on a command line.
 * The Management API token is only ever sent in an Authorization header, and
 * the CLI subprocess inherits it through its environment rather than an argv.
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const API = "https://api.supabase.com/v1";
const REF = process.env.SUPABASE_PROJECT_REF || "fbalfkvimlfmcpsfzrvn";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

// ---------------------------------------------------------------- args

function flag(name) {
  return process.argv.includes(`--${name}`);
}
/** Accepts both `--name=value` and `--name value`. */
function value(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  return undefined;
}

const DRY_RUN = flag("dry-run");
const ASSUME_YES = flag("yes");
const PROMOTE_EMAIL = value("promote");
const ONLY = value("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const wants = (step) => !ONLY || ONLY.includes(step);

const STEPS = ["smtp", "templates", "secrets", "deploy", "promote"];

// ---------------------------------------------------------------- helpers

function mask(value) {
  if (!value) return "(not set)";
  const s = String(value);
  if (s.length <= 8) return `${s.slice(0, 2)}…(${s.length} chars)`;
  return `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} chars)`;
}

function say(...args) {
  console.log(...args);
}
function step(name) {
  say(`\n── ${name} ${"─".repeat(Math.max(0, 58 - name.length))}`);
}

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> HTTP ${res.status}\n${text.slice(0, 600)}`);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * Normalise the `/database/query` reply.
 *
 * That endpoint has answered in two shapes: a bare array of row objects, and a
 * one-element array wrapping the rows under `result`. Reading only the wrapper
 * silently yields "no rows" — which is how a promote that matched a real
 * profile reported 0 matched and refused to run.
 */
function rowsFrom(reply) {
  const first = Array.isArray(reply) ? reply[0] : null;
  if (first && Array.isArray(first.result)) return first.result;
  return Array.isArray(reply) ? reply : [];
}

function templatePath(name) {
  return `supabase/email-templates/${name}`;
}

/** Read a template off disk, failing loudly if it is not there. */
async function readTemplate(name) {
  const path = templatePath(name);
  try {
    return await readFile(path, "utf8");
  } catch {
    throw new Error(`missing template file: ${path}`);
  }
}

// ---------------------------------------------------------------- 1. smtp

/**
 * Supabase Auth email settings. `mailer_settings` replaces GoTrue's built-in
 * SMTP wholesale, so after this every Auth email leaves through Resend.
 *
 * The sender address has to be on a domain you have verified in Resend,
 * otherwise GoTrue accepts it and the mail silently goes to spam.
 */
function smtpPayload() {
  const host = process.env.RESEND_SMTP_HOST || "smtp.resend.com";
  const port = process.env.RESEND_SMTP_PORT || "465";
  const username = process.env.RESEND_SMTP_USER || "resend";
  const password = process.env.RESEND_SMTP_PASSWORD;
  const adminEmail = process.env.RESEND_ADMIN_EMAIL;
  const senderName = process.env.RESEND_SENDER_NAME || "AccsMartHub";

  if (!password) throw new Error("RESEND_SMTP_PASSWORD is required (your Resend API key).");
  if (!adminEmail) throw new Error("RESEND_ADMIN_EMAIL is required (a verified Resend sender).");

  return {
    mailer_settings: {
      host,
      // GoTrue stores the port as a string; the Dashboard sends "587"/"465".
      port,
      username,
      password,
      admin_email: adminEmail,
      sender_name: senderName,
    },
  };
}

// ---------------------------------------------------------------- 2. templates

/**
 * GoTrue keeps one template per email type. Two mapping notes that matter:
 *
 *  - `magic_link` is the slot the passwordless sign-in button on /auth fills,
 *    which is the mail that currently arrives as a plain Supabase message.
 *  - `email-verification.html` is reused there deliberately: a GoTrue magic
 *    link both signs the user in and confirms their address, so the
 *    "Verify my email" wording is accurate for that link too.
 */
async function templatePayload() {
  const confirmation = await readTemplate("email-verification.html");
  const recovery = await readTemplate("password-reset.html");
  const emailChange = await readTemplate("email-change.html");

  return {
    mailer_templates_confirmation_content: confirmation,
    mailer_templates_magic_link_content: confirmation,
    mailer_templates_recovery_content: recovery,
    mailer_templates_email_change_content: emailChange,
    mailer_subjects_confirmation: "Verify your AccsMartHub email",
    mailer_subjects_magic_link: "Sign in to AccsMartHub",
    mailer_subjects_recovery: "Reset your AccsMartHub password",
    mailer_subjects_email_change: "Confirm your new AccsMartHub email",
  };
}

// ---------------------------------------------------------------- 3. secrets

/**
 * Project-level Edge Function secrets. Both functions read
 * OXAPAY_MERCHANT_API_KEY; only create-deposit-invoice reads OXAPAY_SANDBOX.
 * ALLOWED_ORIGINS is optional and defaults to the auth redirect allowlist
 * inside the function.
 */
function secretPayload() {
  const key = process.env.OXAPAY_MERCHANT_API_KEY;
  const sandbox = process.env.OXAPAY_SANDBOX;
  if (!key) throw new Error("OXAPAY_MERCHANT_API_KEY is required.");
  if (!sandbox) {
    throw new Error(
      "OXAPAY_SANDBOX is required and must be explicitly 'true' or 'false'.\n" +
        "The function fails closed, so leaving this unset means no deposits at all.",
    );
  }
  const secrets = [
    { name: "OXAPAY_MERCHANT_API_KEY", value: key },
    { name: "OXAPAY_SANDBOX", value: String(sandbox) },
  ];
  const origins = process.env.ALLOWED_ORIGINS;
  if (origins) secrets.push({ name: "ALLOWED_ORIGINS", value: origins });
  return secrets;
}

// ---------------------------------------------------------------- 4. deploy

const FUNCTIONS = ["create-deposit-invoice", "oxapay-webhook"];

function deploy() {
  // The token goes through the subprocess environment, never argv.
  const childEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: TOKEN, SUPABASE_PROJECT_REF: REF };
  for (const fn of FUNCTIONS) {
    say(`   deploying ${fn}…`);
    const res = spawnSync(
      "npx",
      ["--yes", "supabase", "functions", "deploy", fn, "--project-ref", REF, "--use-api"],
      { stdio: "inherit", env: childEnv },
    );
    if (res.status !== 0) {
      throw new Error(`deploy failed for ${fn} (exit ${res.status})`);
    }
  }
}

// ---------------------------------------------------------------- 5. promote

/**
 * `is_admin` is guarded by `guard_profile_privileges`, which reverts the column
 * on any write that `is_trusted_write()` does not consider trusted — and it
 * reverts SILENTLY (it assigns the old value rather than raising), so a caller
 * cannot tell success from a no-op by status code alone.
 *
 * `is_trusted_write()` is true when the session role is not `anon`/
 * `authenticated`, which is the clause the migration documents as "makes admin
 * bootstrap possible at all". The Management API query endpoint runs as the
 * table owner, so the UPDATE here is trusted. If that ever stops being true the
 * write is reverted and `RETURNING` hands back the OLD value — which is why
 * below we assert the flip instead of assuming it.
 *
 * The SELECT runs first and the UPDATE is refused unless it matched exactly one
 * profile, so a typo'd email can never widen access to the wrong account.
 */
async function promote() {
  if (!PROMOTE_EMAIL) {
    say("   skipped (pass --promote <email> to grant admin)");
    return;
  }
  const listUrl = `/projects/${REF}/database/query`;
  // This endpoint takes a bare statement, not a parameterised query, so the
  // address is embedded as a quoted literal.
  const literal = PROMOTE_EMAIL.replace(/'/g, "''");
  const rows = await api(listUrl, {
    method: "POST",
    body: JSON.stringify({
      query: `select p.id, p.email, p.is_admin from public.profiles p where lower(p.email) = lower('${literal}')`,
    }),
  });

  const matched = rowsFrom(rows);
  say(`   matched ${matched.length} profile(s):`);
  for (const r of matched) say(`     ${r.email}  (id ${r.id}, is_admin=${r.is_admin})`);

  if (matched.length !== 1) {
    throw new Error(
      `expected exactly 1 profile for ${PROMOTE_EMAIL}, matched ${matched.length} — nothing changed`,
    );
  }

  if (!ASSUME_YES) {
    say("\n   Re-run with --yes to perform the UPDATE.");
    return;
  }

  const updated = await api(listUrl, {
    method: "POST",
    body: JSON.stringify({
      query: `update public.profiles set is_admin = true where id = '${matched[0].id}' returning id, email, is_admin`,
    }),
  });
  const row = rowsFrom(updated)[0];
  say(`   ${JSON.stringify(rowsFrom(updated))}`);

  if (row?.is_admin !== true) {
    throw new Error(
      `is_admin is still ${String(row?.is_admin)} for ${matched[0].id} — the write looks like it\n` +
        "was reverted by the guard_profile_privileges trigger. Run the same UPDATE from\n" +
        "Dashboard -> SQL Editor instead (that session is trusted too).",
    );
  }
  say(`   ✓ ${row.email} is now an admin.`);
}

// ---------------------------------------------------------------- main

async function main() {
  if (!TOKEN) {
    console.error(
      "Missing SUPABASE_ACCESS_TOKEN.\n\n" +
        "Create one at https://supabase.com/dashboard/account/tokens (Personal access\n" +
        "token -> Generate). The earlier token was revoked, which is why the project\n" +
        "cannot be configured from here.\n\n" +
        "Nothing is read from a .env file — pass it on the command line.",
    );
    process.exit(1);
  }

  const plan = STEPS.filter(wants).filter((s) => s !== "promote" || PROMOTE_EMAIL);
  say(`Project ${REF}${DRY_RUN ? "  (DRY RUN — no changes will be made)" : ""}`);
  say(`Steps: ${plan.join(", ") || "none"}`);
  if (wants("templates") && !wants("smtp")) {
    say(
      "NOTE: on a free-tier project Supabase refuses template changes while the default\n" +
        "      mail provider is in use — this step needs `smtp` in the same run.",
    );
  }

  // Fail fast on missing input before anything is half-applied.
  if (wants("smtp")) smtpPayload();
  if (wants("templates")) {
    for (const name of ["email-verification.html", "password-reset.html", "email-change.html"]) {
      const text = await readTemplate(name);
      if (!text.includes("{{ .ConfirmationURL }}")) {
        throw new Error(`${templatePath(name)} has no {{ .ConfirmationURL }} — it would send a mail with no link`);
      }
    }
  }
  if (wants("secrets")) secretPayload();

  if (DRY_RUN) {
    if (wants("smtp")) {
      step("smtp");
      const smtp = smtpPayload().mailer_settings;
      say(`   host ${smtp.host}:${smtp.port}  user ${smtp.username}`);
      say(`   password ${mask(smtp.password)}`);
      say(`   from    ${smtp.sender_name} <${smtp.admin_email}>`);
    }
    if (wants("templates")) {
      step("templates");
      for (const [slot, name] of [
        ["confirmation + magic_link", "email-verification.html"],
        ["recovery", "password-reset.html"],
        ["email change", "email-change.html"],
      ]) {
        const text = await readTemplate(name);
        say(`   ${slot.padEnd(24)} <- ${name} (${text.length} bytes)`);
      }
    }
    if (wants("secrets")) {
      step("secrets");
      for (const s of secretPayload()) say(`   ${s.name} = ${mask(s.value)}`);
    }
    if (wants("deploy")) {
      step("deploy");
      for (const fn of FUNCTIONS) say(`   ${fn}`);
    }
    if (wants("promote")) {
      step("promote");
      say(PROMOTE_EMAIL ? `   ${PROMOTE_EMAIL}` : "   skipped");
    }
    say("\nDry run complete — nothing was sent.");
    return;
  }

  if (wants("smtp") || wants("templates")) {
    step("smtp + templates");
    const payload = { ...(wants("smtp") ? smtpPayload() : {}), ...(await templatePayload()) };
    const before = await api(`/projects/${REF}/config/auth`);
    say(`   was: mailer host ${before?.mailer_settings?.host ?? "(supabase default)"}`);
    try {
      await api(`/projects/${REF}/config/auth`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // A free-tier project still on Supabase's own mail provider is not allowed
      // to change EMAIL TEMPLATES at all. SMTP settings and templates travel in
      // the same request, so `--only templates` can never work there.
      if (/free tier|default email provider/i.test(err.message)) {
        throw new Error(
          `${err.message}\n\nThis project is on the free tier, where Supabase refuses email\n` +
            "TEMPLATE changes until a custom SMTP provider is configured — both have to\n" +
            "be sent in the same request. Re-run with `smtp` included (which needs a\n" +
            "sender address on a domain verified in Resend), or upgrade the project.",
        );
      }
      throw err;
    }
    const after = await api(`/projects/${REF}/config/auth`);
    say(`   now: mailer host ${after?.mailer_settings?.host} from ${after?.mailer_settings?.admin_email}`);
    say(`   magic_link template: ${after?.mailer_templates_magic_link_content ? "set" : "MISSING"}`);
  }

  if (wants("secrets")) {
    step("secrets");
    const secrets = secretPayload();
    await api(`/projects/${REF}/secrets`, {
      method: "POST",
      body: JSON.stringify(secrets),
    });
    say(`   wrote ${secrets.map((s) => s.name).join(", ")}`);

    // Read-back is a confirmation only, so it must never be able to turn a
    // successful write into a crash. This endpoint has answered with both a
    // bare array and a { secrets: [...] } object across API versions.
    try {
      const listed = await api(`/projects/${REF}/secrets`);
      const rows = Array.isArray(listed) ? listed : (listed?.secrets ?? []);
      const names = rows.map((s) => s.name).sort();
      const missing = secrets.map((s) => s.name).filter((n) => !names.includes(n));
      say(`   project secrets now: ${names.join(", ") || "(none)"}`);
      if (missing.length) say(`   WARNING not listed back: ${missing.join(", ")}`);
    } catch (err) {
      say(`   (could not read secrets back: ${err.message.split("\n")[0]})`);
    }
  }

  if (wants("deploy")) {
    step("deploy");
    deploy();
  }

  if (wants("promote")) {
    step("promote");
    await promote();
  }

  say("\nDone. Re-run with --dry-run any time to see what a run would do.");
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});