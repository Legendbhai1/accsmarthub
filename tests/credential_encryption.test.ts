/**
 * Credential envelope encryption.
 *
 * The layout is `iv (12) || ciphertext || tag (16)` and BOTH Edge Functions
 * depend on it, so it is asserted here rather than left to the deployed code.
 *
 * The bug this file exists to catch: `upload-credentials` allocated the sealed
 * buffer as `iv.length + plaintext.length`, but `crypto.subtle.encrypt` returns
 * ciphertext PLUS a 16-byte GCM tag. The buffer was 16 bytes short and `set`
 * threw `RangeError: offset is out of bounds`, so every credential upload
 * failed with an opaque `500` — the "unable to upload keys" report. A round
 * trip that only ever used the same wrong constant on both sides would still
 * pass, so the size assertion below is deliberate.
 */
import { describe, it, expect } from "vitest";
import {
  IV_BYTES,
  sealUnit,
  openUnit,
  bytesToB64,
  b64ToBytes,
} from "../supabase/functions/_shared/credentialCrypto.ts";

const KEY = "test-passphrase-not-a-real-secret";
const UNIT = "username: someone@example.com\npassword: hunter2\n2fa: ABC-DEF";

describe("credential envelope encryption", () => {
  it("round-trips a unit unchanged", async () => {
    const sealed = await sealUnit(KEY, UNIT);
    expect(await openUnit(KEY, sealed)).toBe(UNIT);
  });

  it("sizes the sealed blob as iv + ciphertext + 16-byte GCM tag", async () => {
    const sealed = await sealUnit(KEY, UNIT);
    const plainBytes = new TextEncoder().encode(UNIT).length;
    expect(sealed.byteLength).toBe(IV_BYTES + plainBytes + 16);
    // Non-vacuity: the old allocation was `iv + plaintext`, which is exactly
    // 16 bytes shorter. Asserting the difference pins the bug, not just the
    // current constant.
    expect(sealed.byteLength - (IV_BYTES + plainBytes)).toBe(16);
  });

  it("accepts an empty credential without throwing", async () => {
    const sealed = await sealUnit(KEY, "");
    expect(sealed.byteLength).toBe(IV_BYTES + 16);
    expect(await openUnit(KEY, sealed)).toBe("");
  });

  it("uses a fresh IV per unit so equal plaintexts differ", async () => {
    const a = await sealUnit(KEY, UNIT);
    const b = await sealUnit(KEY, UNIT);
    expect(bytesToB64(a)).not.toBe(bytesToB64(b));
  });

  it("fails to open with the wrong passphrase", async () => {
    const sealed = await sealUnit(KEY, UNIT);
    await expect(openUnit("a-different-passphrase", sealed)).rejects.toThrow();
  });

  it("survives the base64 hop the RPC boundary uses", async () => {
    const sealed = await sealUnit(KEY, UNIT);
    const restored = b64ToBytes(bytesToB64(sealed));
    expect(Array.from(restored)).toEqual(Array.from(sealed));
    expect(await openUnit(KEY, restored)).toBe(UNIT);
  });

  it("rejects a blob too short to hold an IV", async () => {
    await expect(openUnit(KEY, new Uint8Array(4))).rejects.toThrow(/too short/i);
  });
});
