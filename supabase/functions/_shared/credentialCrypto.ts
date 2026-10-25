/**
 * Credential envelope encryption, shared by the `upload-credentials` and
 * `download-credentials` Edge Functions.
 *
 * Both halves MUST agree on the byte layout, so the layout lives here once and
 * is exercised directly by `tests/credential_encryption.test.ts` rather than
 * being copied into each function.
 *
 * Layout: `iv (12 bytes) || ciphertext || tag (16 bytes)`.
 *
 * This module previously lived inline in the upload function as:
 *
 *     const sealed = new Uint8Array(iv.length + plain.length);   // WRONG
 *     sealed.set(new Uint8Array(body), iv.length);               // RangeError
 *
 * `crypto.subtle.encrypt` returns the ciphertext PLUS a 16-byte GCM tag, so
 * the buffer was 16 bytes too small and `set` threw `RangeError: offset is out
 * of bounds` on every upload — which the platform surfaced to the seller as an
 * opaque `500 Internal Server Error`, i.e. "unable to upload keys". The
 * allocation is `iv.length + ciphertext.byteLength` for that reason, and the
 * test pins it.
 *
 * The key is derived as SHA-256(passphrase), imported as a raw AES-GCM key.
 * Both functions must keep that derivation identical or stored credentials
 * become undecryptable.
 */

/** GCM standard nonce length. WebCrypto assumes this when no `iv` is passed. */
export const IV_BYTES = 12;

/** SHA-256 the passphrase and import the digest as an AES-GCM key. */
export async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(passphrase),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt one unit, returning the sealed blob ready to store.
 *
 * A fresh IV per call: reusing one under the same key would leak plaintext
 * relationships between accounts.
 */
export async function sealUnit(
  passphrase: string,
  plaintext: string,
): Promise<Uint8Array> {
  const key = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const sealed = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  sealed.set(iv, 0);
  sealed.set(ciphertext, IV_BYTES);
  return sealed;
}

/** Decrypt a blob produced by `sealUnit`. */
export async function openUnit(
  passphrase: string,
  sealed: Uint8Array,
): Promise<string> {
  if (sealed.byteLength <= IV_BYTES) {
    throw new Error("Stored credential is too short to contain an IV.");
  }
  const key = await deriveKey(passphrase);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: sealed.subarray(0, IV_BYTES) },
    key,
    sealed.subarray(IV_BYTES),
  );
  return new TextDecoder().decode(plain);
}

/** bytes -> base64, chunked so a large unit cannot blow the argument limit. */
export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** base64 -> bytes. */
export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
