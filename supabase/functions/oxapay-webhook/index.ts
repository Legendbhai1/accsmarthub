/**
 * AccsMartHub — OxaPay payment webhook (Supabase Edge Function)
 *
 * Replaces the old Convex webhook. Confirms a deposit and credits the
 * buyer's wallet exactly once.
 *
 * Security properties:
 *   - The request body is verified against OxaPay's HMAC-SHA512 signature
 *     BEFORE anything is read or written. An unsigned or forged ping is
 *     rejected outright, so nobody can credit themselves money.
 *   - The track_id must already exist as a pending deposit created by the
 *     buyer's own session. A webhook cannot invent a deposit.
 *   - credit_wallet() is EXECUTE-granted to service_role only, so this is the
 *     only code path that can move money in.
 *   - Re-delivery is safe: a deposit already marked paid is ignored, so OxaPay
 *     retrying a callback cannot double-credit a buyer.
 *
 * Configure once:
 *   Edge Functions → Secrets → OXAPAY_MERCHANT_API_KEY = <your OxaPay key>
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MERCHANT_KEY = Deno.env.get("OXAPAY_MERCHANT_API_KEY");

/** OxaPay reports these as "paid"; anything else is ignored. */
const PAID_STATUSES = new Set(["paid", "Paid", "completed", "finished"]);

/**
 * Hex HMAC-SHA512 of the raw body.
 *
 * OxaPay documents the callback signature as HMAC **sha512** keyed with the
 * Merchant API key, sent in the `HMAC` header. The previous implementation
 * used SHA-256, which could never match a genuine callback — every real
 * webhook was rejected with 401 and no deposit was ever credited.
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

function db(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // Always answer 200 for a body we cannot parse, so OxaPay stops retrying.
  const raw = await req.text();

  if (!MERCHANT_KEY) {
    return new Response("webhook not configured", { status: 500 });
  }

  // 1. Verify the signature BEFORE trusting anything in the payload.
  const provided = (req.headers.get("HMAC") ?? req.headers.get("hmac") ?? "").trim();
  const expected = await sign(raw);
  if (!provided || !safeEqual(provided.toLowerCase(), expected)) {
    return new Response("invalid signature", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("ok");
  }

  const trackId = String(body.track_id ?? body.order_id ?? "").trim();
  const status = String(body.status ?? "").trim();
  if (!trackId || !PAID_STATUSES.has(status)) return new Response("ok");

  // 2. The deposit must already exist and still be pending. This is what
  //    stops a webhook from inventing a top-up.
  const found = await db(
    `deposits?track_id=eq.${encodeURIComponent(trackId)}&status=eq.pending&select=track_id,user_id,amount_usd`,
  );
  if (!found.ok) return new Response("db error", { status: 500 });

  const deposit = (await found.json()) as Array<{
    track_id: string;
    user_id: string;
    amount_usd: number | string;
  }>;
  if (!deposit.length) return new Response("ok"); // unknown or already paid

  const row = deposit[0];
  const amount = Number(row.amount_usd);

  // 3. Mark paid FIRST. If crediting then fails, the retry finds nothing
  //    pending and stops — the admin can reconcile that rare case by hand
  //    rather than a buyer being silently short-changed twice.
  const marked = await db(`deposits?track_id=eq.${encodeURIComponent(trackId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }),
  });
  if (!marked.ok) return new Response("db error", { status: 500 });

  // 4. Credit the buyer.
  const credited = await db("rpc/credit_wallet", {
    method: "POST",
    body: JSON.stringify({ p_user_id: row.user_id, p_amount: amount }),
  });
  if (!credited.ok) {
    console.error("credit_wallet failed for", trackId, await credited.text());
    return new Response("credit failed", { status: 500 });
  }

  return new Response("ok");
});