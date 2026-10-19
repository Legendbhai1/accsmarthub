/**
 * Reports which migrations in supabase/migrations are actually present in a
 * live Supabase project. Read-only: it issues SELECTs against pg_catalog and
 * never writes.
 *
 *   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \
 *     node scripts/check-schema.mjs
 *
 * Why this exists
 * ---------------
 * The repository had drifted from production without anything noticing. The
 * project was originally migrated as "0001-0006, then 0013+", which silently
 * skipped 0007-0012. 0013 reconciles the objects it knows about, but not the
 * `listings` insert policy that 0008 rewrites — so production was still
 * enforcing 0001's "your store must be approved" clause and every attempt to
 * create a listing failed with "You do not have access to that information."
 *
 * Nothing in the build, the type checker or the test suite can see a missing
 * migration; only the database can. Run this before shipping a change that
 * depends on a new migration.
 *
 * Exit codes: 0 = every migration applied, 1 = drift detected, 2 = could not
 * check (missing credentials or an API error).
 */

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!REF || !TOKEN) {
  console.error(
    "Set SUPABASE_PROJECT_REF=<ref> and SUPABASE_ACCESS_TOKEN=sbp_...\n" +
      "Neither value is read from .env — pass them on the command line.",
  );
  process.exit(2);
}

/**
 * One sentinel per migration: an object that the migration is the only source
 * of. If the sentinel is missing, that migration (or a later one that depends
 * on it) was never applied.
 *
 * Each `probe` must be a read-only query returning a single boolean.
 */
const SENTINELS = [
  {
    file: "0001_core.sql",
    what: "profiles / wallets / orders base tables",
    probe: `select to_regclass('public.wallets') is not null
              and to_regclass('public.orders') is not null`,
  },
  {
    file: "0002_storage.sql",
    what: "listing-assets storage bucket",
    probe: `select exists (select 1 from storage.buckets where id = 'listing-assets')`,
  },
  {
    file: "0003_disputes.sql",
    what: "disputes + dispute_messages",
    probe: `select to_regclass('public.disputes') is not null
              and to_regclass('public.dispute_messages') is not null`,
  },
  {
    file: "0004_payments.sql",
    what: "credit_wallet()",
    probe: `select exists (select 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'credit_wallet')`,
  },
  {
    file: "0005_deposit_settlement.sql",
    what: "deposits.provider_txn_id",
    probe: `select exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'deposits'
               and column_name = 'provider_txn_id')`,
  },
  {
    file: "0006_deposit_currency_fix.sql",
    what: "deposits.pay_currency",
    probe: `select exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'deposits'
               and column_name = 'pay_currency')`,
  },
  {
    file: "0007_email_and_store_policy.sql",
    what: "admin_audit + disposable_email_domains",
    probe: `select to_regclass('public.admin_audit') is not null
              and to_regclass('public.disposable_email_domains') is not null`,
  },
  {
    file: "0008_listing_first_publishing.sql",
    what: "listing insert policy does not require an approved store",
    // The actual production bug. 0001 and 0008 define this policy; only 0008
    // removes the `stores.status = 'approved'` clause.
    probe: `select position('approved' in coalesce((
              select pg_get_expr(polwithcheck, polrelid) from pg_policy
               where polname = 'insert own listing'
                 and polrelid = 'public.listings'::regclass), '')) = 0`,
  },
  {
    file: "0009_buying_to_delivery_lifecycle.sql",
    what: "orders.delivery_status",
    probe: `select exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'orders'
               and column_name = 'delivery_status')`,
  },
  {
    file: "0010_admin_users_edge_function.sql",
    what: "admin_list_users()",
    probe: `select exists (select 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'admin_list_users')`,
  },
  {
    file: "0011_dispute_rls_fix.sql",
    what: "dispute_messages.author_role",
    probe: `select exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'dispute_messages'
               and column_name = 'author_role')`,
  },
  {
    file: "0012_dispute_resolution_consistency.sql",
    what: "log_admin_audit()",
    probe: `select exists (select 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'log_admin_audit')`,
  },
  {
    file: "0013_reconcile_marketplace.sql",
    what: "order_events + order_refunds",
    probe: `select to_regclass('public.order_events') is not null
              and to_regclass('public.order_refunds') is not null`,
  },
  {
    file: "0014_seller_payouts.sql",
    what: "payout_requests + request_payout()",
    probe: `select to_regclass('public.payout_requests') is not null
              and exists (select 1 from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'request_payout')`,
  },
  {
    file: "0015_support_request_safety.sql",
    what: "resolve_report() refuses self-reports",
    // 0001 defines resolve_report too, so presence alone proves nothing. 0015
    // is the version that guards against a reporter pausing themselves.
    probe: `select position('v_r.reported_user_id <> v_r.reporter_id'
              in pg_get_functiondef('public.resolve_report(uuid,text,text)'::regprocedure)) > 0`,
  },
  {
    file: "0016_saved_listings.sql",
    what: "saved_listings",
    probe: `select to_regclass('public.saved_listings') is not null`,
  },
];

async function runQuery(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  return res.json();
}

let missing = 0;
let failed = 0;

for (const sentinel of SENTINELS) {
  let present;
  try {
    // The endpoint returns an array of rows; a scalar select is one row with
    // one column.
    const rows = await runQuery(sentinel.probe);
    present = Object.values(rows[0] ?? {})[0] === true;
  } catch (err) {
    console.log(`  ??   ${sentinel.file}  could not check: ${err.message}`);
    failed++;
    continue;
  }

  if (present) {
    console.log(`  ok   ${sentinel.file}  ${sentinel.what}`);
  } else {
    console.log(`  MISS ${sentinel.file}  ${sentinel.what}`);
    missing++;
  }
}

console.log();
if (failed > 0) {
  console.error(`RESULT: could not check ${failed} migration(s).`);
  process.exit(2);
}
if (missing > 0) {
  console.error(
    `RESULT: ${missing} migration(s) missing from project ${REF}.\n` +
      "Apply them in order:\n" +
      "  SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... \\\n" +
      "    node scripts/migrate.mjs supabase/migrations/<file>.sql",
  );
  process.exit(1);
}
console.log(`RESULT: all ${SENTINELS.length} migrations are applied.`);
