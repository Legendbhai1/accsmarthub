/**
 * AccsMartHub — credential upload (Supabase Edge Function)
 *
 * The counterpart to `download-credentials`. It exists because of a real
 * constraint: `CREDENTIALS_ENCRYPTION_KEY` is a function SECRET, so the browser
 * can never hold it — which means the browser cannot encrypt on upload either,
 * even though `upload_credentials` expects `ciphertext` (base64 AES-GCM).
 *
 * Doing the encryption here is what makes the two halves symmetric: the seller
 * sends plaintext over TLS, this function encrypts it with the same passphrase
 * the download function uses, and the ciphertext is what lands in Postgres.
 *
 * Flow:
 *   1. Verify the caller's Supabase access token.
 *   2. Call upload_credentials(listing_id, units) AS THE CALLER — not as the
 *      service role — so the SECURITY DEFINER function still sees auth.uid() =
 *      the seller and enforces "you do not own this listing".
 *   3. Encrypt each unit with AES-GCM under the function SECRET.
 *
 * Configure once in the Supabase dashboard:
 *   Edge Functions → Secrets → CREDENTIALS_ENCRYPTION_KEY = <your saved key>
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PASSPHRASE = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");

/**
 * PostgREST wants the project's PUBLISHABLE (anon) key in `apikey` and the
 * caller's access token in `Authorization`. Sending the access token as the
 * apikey — which both calls below used to do — is rejected with `401 Invalid
 * API key`, so every save failed with what looked like a permissions problem.
 */
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

/** Must match the 64 KB limit enforced in the `upload_credentials` RPC. */
const MAX_UNIT_BYTES = 60_000;
const MAX_UNITS = 500;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type IncomingUnit = {
  unitKey?: string;
  fileName?: string;
  credentials: string;
};

/**
 * Identical to the download function's derivation: SHA-256 the passphrase,
 * import as an AES-GCM key. Both sides must stay in lockstep or stored
 * credentials become undecryptable.
 */
async function getKey(passphrase: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(passphrase),
  );
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt"]);
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (!PASSPHRASE) {
    return json({ error: "Credential storage is not configured on this function." }, 500);
  }

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "You must be signed in." }, 401);
  }

  let listingId = "";
  let units: IncomingUnit[] = [];
  try {
    const body = await req.json();
    listingId = String(body?.listingId ?? "").trim();
    units = Array.isArray(body?.units) ? body.units : [];
  } catch {
    return json({ error: "listingId and units are required." }, 400);
  }

  if (!listingId) return json({ error: "listingId is required." }, 400);
  if (units.length === 0) return json({ error: "No credentials were supplied." }, 400);
  if (units.length > MAX_UNITS) {
    return json({ error: `At most ${MAX_UNITS} accounts can be uploaded at once.` }, 400);
  }

  // Reject oversized units before doing any crypto work.
  for (const u of units) {
    const text = String(u?.credentials ?? "");
    if (new TextEncoder().encode(text).length > MAX_UNIT_BYTES) {
      return json({ error: "A credential file may not exceed 60 KB." }, 400);
    }
  }

  const key = await getKey(PASSPHRASE);

  const encrypted: Array<{ unitKey: string; fileName: string; ciphertext: string }> = [];
  for (const [index, u] of units.entries()) {
    const plain = new TextEncoder().encode(String(u?.credentials ?? ""));
    // A fresh 12-byte IV per unit: reusing one under the same key would leak
    // plaintext relationships between accounts.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(iv.length + plain.length);
    sealed.set(iv, 0);
    const body = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plain,
    );
    sealed.set(new Uint8Array(body), iv.length);

    encrypted.push({
      unitKey: String(u?.unitKey ?? `unit-${index + 1}`),
      fileName: String(u?.fileName ?? "account.txt"),
      ciphertext: bytesToB64(sealed),
    });
  }

  // The caller's own token — NOT the service role, so the RPC's ownership
  // check ("You do not own this listing") still applies.
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/upload_credentials`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_listing_id: listingId, p_units: encrypted }),
  });

  if (!rpc.ok) {
    const detail = await rpc.text();
    return json({ error: friendly(detail) }, rpc.status === 401 || rpc.status === 403 ? 403 : 400);
  }

  const uploaded = Number(await rpc.json()) || encrypted.length;

  // The RPC resets `listings.stock` to the number of unclaimed units, so the
  // seller UI can show the real remaining inventory after a save.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/credential_status`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_listing_id: listingId }),
  });
  const status = res.ok ? await res.json() : null;

  return json({ uploaded, ...(status ?? {}) });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Turn Postgres error text into something a seller can act on. */
function friendly(detail: string): string {
  if (/do not own this listing/i.test(detail)) {
    return "You can only attach credentials to your own listings.";
  }
  if (/not found/i.test(detail)) return "That listing no longer exists.";
  if (/64 KB|exceed/i.test(detail)) return "A credential file may not exceed 60 KB.";
  if (/too many units/i.test(detail)) return "Too many accounts in one upload.";
  return "We could not save your credentials. Please try again.";
}