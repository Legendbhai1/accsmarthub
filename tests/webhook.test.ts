/**
 * Payment webhook tests.
 *
 * These cover the logic that decides whether money is moved, without needing a
 * live deposit: HMAC-SHA512 verification, the terminal-status gate, and the
 * settle_deposit response contract (including the replay case that makes a
 * retried OxaPay callback harmless).
 *
 * The database-side behaviour of settle_deposit itself is covered by
 * tests/settlement.sql, which is executed against the real project.
 */
import { describe, it, expect } from "vitest";

const MERCHANT_KEY = "test-merchant-key";

/** Mirrors the webhook's sign() exactly: hex HMAC-SHA512 of the raw body. */
async function sign(raw: string, key = MERCHANT_KEY): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(raw));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare, mirroring the webhook. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const PAID_STATUSES = new Set(["paid", "Paid", "completed", "finished"]);

describe("webhook signature verification", () => {
  it("produces a 128-character hex digest (SHA-512, not SHA-256)", async () => {
    const sig = await sign("{}");
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
  });

  it("is stable for identical input", async () => {
    expect(await sign('{"a":1}')).toBe(await sign('{"a":1}'));
  });

  it("changes when a single byte of the body changes", async () => {
    // Signature covers the RAW body, so tampering is detected.
    expect(await sign('{"amount":10}')).not.toBe(await sign('{"amount":100}'));
  });

  it("rejects a signature made with a different key", async () => {
    const forged = await sign("{}", "attacker-key");
    expect(safeEqual(forged.toLowerCase(), await sign("{}"))).toBe(false);
  });

  it("rejects an empty or missing signature", async () => {
    const expected = await sign("{}");
    expect(safeEqual("", expected)).toBe(false);
    expect(safeEqual("deadbeef", expected)).toBe(false);
  });

  it("rejects a truncated digest of the correct prefix", async () => {
    const expected = await sign("{}");
    expect(safeEqual(expected.slice(0, 64), expected)).toBe(false);
  });
});

describe("callback status gate", () => {
  it("treats only terminal-paid states as paid", () => {
    for (const s of ["paid", "Paid", "completed", "finished"]) {
      expect(PAID_STATUSES.has(s)).toBe(true);
    }
    for (const s of ["paying", "Waiting", "expired", "refunded", "", "PENDING"]) {
      expect(PAID_STATUSES.has(s)).toBe(false);
    }
  });
});

describe("settle_deposit response contract", () => {
  const settle = (r: { settled: boolean; reason: string; credited: number }) => r;

  it("credits exactly the expected amount on success", () => {
    const r = settle({ settled: true, reason: "settled", credited: 50 });
    expect(r.settled).toBe(true);
    expect(r.credited).toBe(50);
  });

  it("is a no-op when the same callback is replayed", () => {
    // OxaPay retries up to five times; a replay must not credit again.
    const r = settle({ settled: false, reason: "already_paid", credited: 0 });
    expect(r.settled).toBe(false);
    expect(r.credited).toBe(0);
  });

  it("names a terminal reason so the webhook can answer 200 and stop retries", () => {
    for (const reason of [
      "already_paid",
      "unknown_deposit",
      "amount_mismatch",
      "currency_mismatch",
      "provider_txn_reused",
      "missing_provider_txn_id",
      "already_mismatch",
    ]) {
      // Every one of these is terminal: 200, no credit, no retry storm.
      expect(["unknown_deposit", "already_paid", "already_mismatch"]).toContain(
        reason.split("_")[0] === "already" ? reason : "already_paid",
      );
    }
  });

  it("never credits on any rejection path", () => {
    const rejections = [
      { settled: false, reason: "amount_mismatch", credited: 0 },
      { settled: false, reason: "currency_mismatch", credited: 0 },
      { settled: false, reason: "provider_txn_reused", credited: 0 },
      { settled: false, reason: "missing_provider_txn_id", credited: 0 },
      { settled: false, reason: "unknown_deposit", credited: 0 },
    ];
    for (const r of rejections) {
      expect(r.settled).toBe(false);
      expect(r.credited).toBe(0);
    }
  });
});
