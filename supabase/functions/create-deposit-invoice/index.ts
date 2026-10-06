/**
 * AccsMartHub — deposit invoice creation (Supabase Edge Function)
 *
 * The browser must never hold `OXAPAY_MERCHANT_API_KEY`. That is why invoice
 * creation lives here rather than in `createDeposit` on the client — a
 * `VITE_`-prefixed key would be bundled into public JavaScript and anyone could
 * mint invoices against your merchant account.
 *
 * Flow:
 *   1. Verify the caller's Supabase access token.
 *   2. Read the deposit AS THE CALLER, so RLS proves it is their own pending
 *      row. A caller cannot invoice against somebody else's track_id.
 *   3. Ask OxaPay for an invoice and return the payment URL.
 *
 * `order_id` is set to our track_id, which is what lets the webhook match a
 * callback back to a specific buyer.
 *
 * Configure once — Edge Functions → Secrets:
 *   OXAPAY_MERCHANT_API_KEY   your OxaPay merchant key (NEVER a VITE_ var)
 *   OXAPAY_SANDBOX            true = OxaPay test mode, false = LIVE.
 *                             Unset or misspelled = deposits refuse to run.
 *                             Going live is a deliberate act, never a default.
 *   ALLOWED_ORIGINS           optional comma-separated browser origins allowed
 *                             to call this function. Defaults to the same list
 *                             as the Supabase auth `uri_allow_list`.
 *
 * The sandbox flag is a SERVER decision only. The request body is not consulted
 * for it: a client that could flip itself into test mode could pay nothing and
 * still have the webhook settle real wallet credit.
 */

import { resolveOxaPayMode } from "../_shared/oxapayMode.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

/**
 * The project's PUBLISHABLE (anon) key, injected into every Edge Function by
 * Supabase — not a secret anybody sets by hand.
 *
 * PostgREST wants THIS in the `apikey` header and the caller's access token in
 * `Authorization`. Sending the access token as the apikey instead is rejected
 * with `401 Invalid API key`, which is what every deposit hit: the read below
 * failed, and the function reported it as "You must be signed in." — telling a
 * signed-in buyer with a perfectly good deposit that they were not signed in.
 */
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const MERCHANT_KEY = Deno.env.get("OXAPAY_MERCHANT_API_KEY");
const OXAPAY_API = "https://api.oxapay.com/v1";

/**
 * Browser origins allowed to call this function.
 *
 * An unconstrained `Access-Control-Allow-Origin: *` is the wrong shape for an
 * endpoint that accepts the caller's bearer token: it would let any page on the
 * web read the response of a signed-in user it managed to trick into a
 * cross-origin call. So the origin is echoed back only when it is on this
 * list, which mirrors the Supabase auth `uri_allow_list`.
 *
 * Vercel preview deployments get their own `*.vercel.app` host, which is NOT
 * matched by the default. Add it to ALLOWED_ORIGINS while testing a preview.
 */
const DEFAULT_ORIGINS =
  "https://accsmarthub.vercel.app,http://localhost:5173,http://localhost:3000";

const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") ?? DEFAULT_ORIGINS)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

/**
 * Per-request CORS headers.
 *
 * The browser PREFLIGHTS this function, and the preflight is where a missing
 * header does the most damage: without `Access-Control-Allow-Origin` the
 * browser refuses the preflight, never sends the POST at all, and supabase-js
 * reports only "Failed to send a request to the Edge Function" — which looks
 * like a network fault rather than a response this function controls.
 *
 * So EVERY exit below carries these headers: the OPTIONS reply, each error, the
 * success, and the catch-all in the `Deno.serve` wrapper.
 */
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, prefer",
    // A cached preflight stops the browser re-asking before every deposit.
    "Access-Control-Max-Age": "86400",
    // The answer depends on the request's Origin, so caches must not share one.
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

type Deposit = {
  track_id: string;
  user_id: string;
  amount_usd: number | string;
  status: string;
};

/**
 * True when the secret is still the placeholder that ships in this repo. We
 * report that distinctly so the UI can say "not configured" rather than
 * pretending a payment page exists.
 */
function keyLooksLikePlaceholder(key: string): boolean {
  const k = key.trim().toLowerCase();
  return (
    !k ||
    k === "placeholder" ||
    k.startsWith("your-") ||
    k.startsWith("<") ||
    k === "changeme" ||
    k.startsWith("replace")
  );
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  // A throw inside `handle` must not escape as a CORS-less 500, which the
  // browser could only report as an opaque network failure.
  try {
    return await handle(req, cors);
  } catch (err) {
    console.error("create-deposit-invoice crashed", err);
    return json({ error: "The payment service hit an unexpected error." }, 500, cors);
  }
});

async function handle(req: Request, cors: Record<string, string>) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405, cors);
  }

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "You must be signed in." }, 401, cors);
  // Without the publishable key every read below answers 401 and the caller is
  // told they are not signed in, which is wrong and unactionable. Say so plainly
  // instead of blaming the buyer for our own missing configuration.
  if (!SUPABASE_ANON_KEY) {
    console.error("[create-deposit-invoice] SUPABASE_ANON_KEY is not set on the function");
    return json({ error: "The payment service is not configured correctly." }, 500, cors);
  }

  let trackId = "";
  let returnUrl = "";
  try {
    const body = await req.json();
    trackId = String(body?.trackId ?? "").trim();
    returnUrl = String(body?.returnUrl ?? "").trim();
    // `body.sandbox` is deliberately IGNORED. Sandbox vs live is a server-side
    // decision, never a client hint: a caller that could switch itself into
    // test mode could pay nothing and still have the webhook settle real
    // wallet credit against a live merchant account.
  } catch {
    return json({ error: "trackId is required." }, 400, cors);
  }
  if (!trackId) return json({ error: "trackId is required." }, 400, cors);

  if (!MERCHANT_KEY || keyLooksLikePlaceholder(MERCHANT_KEY)) {
    return json(
      {
        error:
          "Card and crypto deposits are not switched on yet. Add your OxaPay merchant API key to switch the gateway on.",
        configured: false,
      },
      503,
      cors,
    );
  }

  // Sandbox or live is decided HERE, from the server's own secret. It is never
  // inferred, never defaulted, and never taken from the request. An unset or
  // misspelled mode refuses to invoice rather than guessing "live".
  const mode = resolveOxaPayMode(Deno.env.get("OXAPAY_SANDBOX"));
  if (!mode.ok) {
    console.error("[create-deposit-invoice] refusing to invoice:", mode.reason);
    return json(
      {
        error:
          "Card and crypto deposits are not switched on yet. The payment mode is not configured, so no payment page can be created.",
        configured: false,
      },
      503,
      cors,
    );
  }

  // The mode is safe to log. The merchant key never is.
  console.log(
    `[create-deposit-invoice] OxaPay mode: ${mode.sandbox ? "SANDBOX (TEST)" : "LIVE"}`,
  );

  // Read the deposit with the CALLER's token so RLS scopes it to them.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/deposits?track_id=eq.${encodeURIComponent(trackId)}&select=track_id,user_id,amount_usd,status`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (res.status === 401 || res.status === 403) {
    return json({ error: "You must be signed in." }, 401, cors);
  }
  if (!res.ok) {
    return json({ error: "Could not read your deposit." }, 500, cors);
  }

  const rows = (await res.json()) as Deposit[];
  const deposit = rows?.[0];
  if (!deposit) {
    return json({ error: "That deposit was not found." }, 404, cors);
  }
  if (deposit.status !== "pending") {
    return json(
      { error: "That deposit has already been settled." },
      409,
      cors,
    );
  }

  const amount = Number(deposit.amount_usd);

  const oxaRes = await fetch(`${OXAPAY_API}/payment/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      merchant_api_key: MERCHANT_KEY,
    },
    body: JSON.stringify({
      amount,
      currency: "USD",
      // OxaPay generates its own track_id; `order_id` is how we correlate the
      // callback back to our deposit row.
      order_id: deposit.track_id,
      description: "AccsMartHub wallet top-up",
      callback_url: `${SUPABASE_URL}/functions/v1/oxapay-webhook`,
      ...(returnUrl ? { return_url: returnUrl } : {}),
      // True routes the invoice onto OxaPay's test network: same API host, same
      // merchant key, fake money. Only the server can set it.
      sandbox: mode.sandbox,
    }),
  });

  const payload = (await oxaRes.json().catch(() => null)) as {
    data?: { track_id?: string; payment_url?: string; expired_at?: number };
    message?: string;
    error?: { message?: string } | null;
  } | null;

  if (!oxaRes.ok) {
    const detail =
      payload?.error?.message || payload?.message || "OxaPay rejected the invoice.";
    console.error("OxaPay invoice failed", oxaRes.status, detail);
    return json({ error: `The payment provider rejected this invoice: ${detail}` }, 502, cors);
  }

  const paymentUrl = payload?.data?.payment_url;
  if (!paymentUrl) {
    return json({ error: "The payment provider returned no payment URL." }, 502, cors);
  }

  return json(
    {
      trackId: deposit.track_id,
      amountUsd: amount,
      paymentUrl,
      expiresAt: payload?.data?.expired_at ?? null,
    },
    200,
    cors,
  );
}

function json(payload: unknown, status: number, extra: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...extra, "Content-Type": "application/json" },
  });
}
