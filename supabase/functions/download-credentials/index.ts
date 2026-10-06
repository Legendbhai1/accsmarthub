/**
 * AccsMartHub — credential download (Supabase Edge Function)
 *
 * The browser can never hold the encryption passphrase and can never decrypt
 * anything itself. This function does both, and only after the database has
 * already confirmed the caller is the paid buyer of that specific order.
 *
 * Flow:
 *   1. Verify the caller's Supabase access token.
 *   2. Call download_credentials(order_no) AS THE CALLER — not as the service
 *      role — so that the SECURITY DEFINER function sees auth.uid() = buyer
 *      and applies its own ownership check. Using the service role here would
 *      silently bypass that check.
 *   3. Decrypt each unit with the passphrase held as a function SECRET.
 *   4. Return a single .txt the buyer saves to disk.
 *
 * Configure once in the Supabase dashboard:
 *   Edge Functions → Secrets → CREDENTIALS_ENCRYPTION_KEY = <your saved key>
 *   (Edge Functions → Secrets → SUPABASE_SERVICE_ROLE_KEY is set for you.)
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PASSPHRASE = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");

/**
 * PostgREST wants the project's PUBLISHABLE (anon) key in `apikey` and the
 * caller's access token in `Authorization`. Sending the access token as the
 * apikey — which the call below used to do — is rejected with `401 Invalid API
 * key`, so a buyer opening their purchased credentials was told they were not
 * allowed to, when the real fault was this header.
 */
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** base64 -> bytes */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Matches the key derivation in the Postgres migration's sibling client code. */
async function getKey(passphrase: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(passphrase),
  );
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["decrypt"]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (!PASSPHRASE) {
    return json({ error: "Credential storage is not configured on this function." }, 500);
  }

  // 1. The caller's own token — NOT the service role.
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "You must be signed in." }, 401);
  }

  let orderNo = "";
  try {
    const body = await req.json();
    orderNo = String(body?.orderNo ?? "").trim();
  } catch {
    return json({ error: "orderNo is required." }, 400);
  }
  if (!orderNo) return json({ error: "orderNo is required." }, 400);

  // 2. Let the DATABASE decide whether this person is allowed to read these
  //    units. Any error here is the database refusing, and we pass it through.
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/download_credentials`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_order_no: orderNo }),
  });

  if (!rpc.ok) {
    const detail = await rpc.text();
    const status = rpc.status === 401 || rpc.status === 403 ? 403 : 400;
    return json({ error: friendly(detail, status) }, status);
  }

  const units = (await rpc.json()) as Array<{
    unit_key: string;
    file_name: string;
    ciphertext: string; // base64, as PostgREST renders bytea
  }>;

  if (!Array.isArray(units) || units.length === 0) {
    return json(
      { error: "No credentials are attached to this order yet." },
      404,
    );
  }

  // 3. Decrypt.
  const key = await getKey(PASSPHRASE);
  const files: Array<{ fileName: string; content: string }> = [];

  for (const unit of units) {
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM" },
        key,
        b64ToBytes(unit.ciphertext),
      );
      files.push({
        fileName: unit.file_name || "account.txt",
        content: new TextDecoder().decode(plain),
      });
    } catch {
      return json(
        {
          error:
            "Stored credentials could not be decrypted. The encryption key on this function does not match the one used to upload them.",
        },
        500,
      );
    }
  }

  return json({ orderNo, files });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Turn Postgres error text into something a buyer can act on. */
function friendly(detail: string, status: number): string {
  if (/not the buyer/i.test(detail)) {
    return "You did not buy this order, so you cannot download these credentials.";
  }
  if (/revoked/i.test(detail)) {
    return "Access to these credentials has been revoked because the order was refunded or disputed.";
  }
  if (/not found/i.test(detail)) return "That order does not exist.";
  if (status === 403) return "You are not allowed to download these credentials.";
  return "We could not load your credentials. Please try again.";
}