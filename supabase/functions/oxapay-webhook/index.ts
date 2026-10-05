/**
 * AccsMartHub — OxaPay payment webhook (Supabase Edge Function)
 *
 * Settles a top-up in ONE atomic database call.
 *
 * Security properties:
 *   - The raw body is verified against OxaPay's HMAC-SHA512 signature BEFORE
 *     anything is parsed or written. An unsigned or forged callback is
 *     rejected outright, so nobody can credit themselves money.
 *   - This function runs with `verify_jwt: false` because OxaPay has no
 *     Supabase JWT. Without that the gateway rejects every genuine callback
 *     with UNAUTHORIZED_NO_AUTH_HEADER before the HMAC is ever checked. The
 *     HMAC is what actually authenticates the caller.
 *   - All money movement lives in `settle_deposit()`, which is EXECUTE-granted
 *     to service_role only. This function cannot credit a wallet on its own.
 *   - Idempotent: OxaPay retries up to five times, and concurrent callbacks
 *     are serialised by a row lock inside the function.
 *
 * RESPONSE CONTRACT
 *   OxaPay retries any non-200. A business rejection (unknown deposit,
 *     already paid, amount mismatch) is terminal, so it gets a 200 plus a
 *   logged reason. Only a genuine infrastructure failure returns 500, which
 *   is the one case where a retry is the correct response.
 *
 * Configure once:
 *   Edge Functions → Secrets → OXAPAY_MERCHANT_API_KEY = <your OxaPay key>
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MERCHANT_KEY = Deno.env.get("OXAPAY_MERCHANT_API_KEY");

/** OxaPay terminal-paid states. Anything else is not money in the bank. */
const PAID_STATUSES = new Set(["paid", "Paid", "completed", "finished"]);

function db(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** Hex HMAC-SHA512 of the raw body.
 *
 * OxaPay documents the callback signature as HMAC **sha512** keyed with the
 * Merchant API key and sent in the `HMAC` header. The previous implementation
 * used SHA-256, which can never match a genuine callback — every real webhook
 * was rejected with 401 and no deposit was ever credited.
 */
async function sign(raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MERCHANT_KEY!),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare so a wrong signature leaks no timing information. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * `date` in the IPN is Unix SECONDS, not ISO. Passing it straight to
 * `new Date()` would build 1970-01-01 and record a nonsense paid_at.
 */
function ts(v: unknown): string | null {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) {
    return new Date(n * 1000).toISOString();
  }
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

Deno.serve(async (req) => {
  // OxaPay posts server-to-server, so CORS is only needed to poke this
  // endpoint from a browser (replaying a callback while debugging). Kept
  // identical in shape to `create-deposit-invoice` so neither endpoint can
  // preflight-fail into a misleading "network error".
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, hmac",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // Read the body as text first: the signature covers the RAW bytes.
  const raw = await req.text();

  if (!MERCHANT_KEY) {
    console.error("OXAPAY_MERCHANT_API_KEY is not set on this function");
    return new Response("webhook not configured", { status: 500 });
  }

  // 1. Authenticate BEFORE trusting anything in the payload.
  const provided = (req.headers.get("HMAC") ?? req.headers.get("hmac") ?? "").trim();
  const expected = await sign(raw);
  if (!provided || !safeEqual(provided.toLowerCase(), expected)) {
    return new Response("invalid signature", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    // Signature was valid but the payload is not JSON. Nothing to settle and
    // nothing a retry would fix.
    console.error("valid HMAC but unparseable body");
    return new Response("ok");
  }

  // Only `invoice` callbacks belong here. Payout IPNs arrive on the same URL
  // but are signed with the PAYOUT_API_KEY, and a merchant key must never be
  // used to settle a withdrawal.
  if (str(body.type) !== "invoice") {
    return new Response("ok");
  }

  // `order_id` is the track_id WE supplied when creating the invoice.
  // `track_id` in the callback is OxaPay's own reference for this payment —
  // that is what we persist as provider_txn_id so one provider payment can
  // never be replayed against a second deposit.
  const trackId = str(body.order_id) || str(body.track_id);
  const providerTxnId = str(body.track_id);
  const status = str(body.status);

  // "Paying" and friends: not terminal, nothing to do. 200 stops the retries.
  if (!trackId || !PAID_STATUSES.has(status)) {
    return new Response("ok");
  }

  // OxaPay's published Paid IPN sample:
  //   { "track_id":"151811887", "status":"Paid", "type":"invoice",
  //     "amount":10, "value":3.6839, "sent_value":3.6839, "currency":"POL",
  //     "order_id":"ORD-12345", "date":1738493900, "txs":[...] }
  //
  // `amount` is the INVOICE denomination (10 for a $10 top-up) and is what we
  // validate. `currency` is the CRYPTOCURRENCY the payer sent ("POL") — it is
  // NOT the deposit currency, and comparing it to 'USD' rejected every valid
  // crypto payment. It is recorded for reconciliation and never gates credit.
  const invoiceAmount = num(body.amount);
  const payCurrency = str(body.currency);
  const paidAt = ts(body.date);

  // 2. One atomic, idempotent call: lock -> validate -> credit + ledger ->
  //    mark paid, all in a single transaction.
  const res = await db("rpc/settle_deposit", {
    method: "POST",
    body: JSON.stringify({
      p_track_id: trackId,
      p_provider_txn_id: providerTxnId,
      p_invoice_amount: invoiceAmount,
      p_pay_currency: payCurrency || null,
      p_paid_at: paidAt,
    }),
  });

  if (!res.ok) {
    // Infrastructure failure. 500 is correct here: a retry is safe because
    // the whole settlement rolled back and the deposit is still pending.
    console.error("settle_deposit failed", res.status, trackId, await res.text());
    return new Response("settlement failed", { status: 500 });
  }

  const rows = (await res.json()) as Array<{ settled: boolean; reason: string; credited: number }>;
  const outcome = rows?.[0];

  if (outcome?.settled) {
    console.log(`deposit settled track=${trackId} txn=${providerTxnId} credited=${outcome.credited}`);
    return new Response("ok");
  }

  // Terminal business rejections. Logged with the reason so an operator can
  // reconcile, and answered 200 so OxaPay stops retrying a callback that will
  // never succeed.
  console.warn(`deposit not settled track=${trackId} reason=${outcome?.reason ?? "no_result"}`);
  return new Response("ok");
});
