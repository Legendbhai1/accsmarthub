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
 * Configure once:
 *   Edge Functions → Secrets → OXAPAY_MERCHANT_API_KEY = <your OxaPay key>
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const MERCHANT_KEY = Deno.env.get("OXAPAY_MERCHANT_API_KEY");
const OXAPAY_API = "https://api.oxapay.com/v1";

/**
 * The browser PREFLIGHTS this function, and the preflight is where a missing
 * header does the most damage: without `Access-Control-Allow-Origin` the
 * browser refuses the preflight, never sends the POST at all, and supabase-js
 * reports only "Failed to send a request to the Edge Function" — which looks
 * like a network fault rather than a response this function controls.
 *
 * So EVERY exit below carries `cors`: the OPTIONS reply, each error, the
 * success, and the catch-all in the `Deno.serve` wrapper.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, prefer",
  // A cached preflight stops the browser re-asking before every deposit.
  "Access-Control-Max-Age": "86400",
};

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
  // A throw inside `handle` must not escape as a CORS-less 500, which the
  // browser could only report as an opaque network failure.
  try {
    return await handle(req);
  } catch (err) {
    console.error("create-deposit-invoice crashed", err);
    return json({ error: "The payment service hit an unexpected error." }, 500, cors);
  }
});

async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405, cors);
  }

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "You must be signed in." }, 401, cors);

  let trackId = "";
  let returnUrl = "";
  let sandbox = false;
  try {
    const body = await req.json();
    trackId = String(body?.trackId ?? "").trim();
    returnUrl = String(body?.returnUrl ?? "").trim();
    sandbox = body?.sandbox === true;
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

  // Read the deposit with the CALLER's token so RLS scopes it to them.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/deposits?track_id=eq.${encodeURIComponent(trackId)}&select=track_id,user_id,amount_usd,status`,
    {
      headers: {
        apikey: token,
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
      sandbox,
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