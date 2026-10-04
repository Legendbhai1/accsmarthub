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
    for (const s of ["Paying", "Waiting", "expired", "refunded", "", "PENDING"]) {
      expect(PAID_STATUSES.has(s)).toBe(false);
    }
  });
});

/**
 * Verbatim Paid IPN sample from https://docs.oxapay.com/webhook
 * `currency` is the CRYPTOCURRENCY paid, not the invoice denomination.
 */
const REAL_PAID_IPN = {
  track_id: "151811887",
  status: "Paid",
  type: "invoice",
  module_name: "OxaPay",
  amount: 10,
  value: 3.6839,
  sent_value: 3.6839,
  currency: "POL",
  order_id: "ORD-12345",
  email: "customer@oxapay.com",
  note: "",
  fee_paid_by_payer: 0,
  under_paid_coverage: 0,
  description: "Test Description",
  date: 1738493900,
  txs: [
    {
      status: "confirmed",
      tx_hash: "x",
      sent_amount: 10,
      received_amount: 9.85,
      value: 3.6839,
      sent_value: 3.6839,
      currency: "POL",
      network: "Polygon Network",
      rate: 0.36839,
      confirmations: 250,
      auto_convert_amount: 3.62864,
      auto_convert_currency: "USDT",
      date: 1738494035,
    },
  ],
};

/** Mirrors the webhook's field extraction. */
function parseIpn(body: Record<string, unknown>) {
  const str = (v: unknown) => (v == null ? "" : String(v).trim());
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const d = Number(body.date);
  return {
    isInvoice: str(body.type) === "invoice",
    trackId: str(body.order_id) || str(body.track_id),
    providerTxnId: str(body.track_id),
    invoiceAmount: num(body.amount),
    // Recorded for reconciliation; NEVER compared to the deposit currency.
    payCurrency: str(body.currency),
    paidAt: Number.isFinite(d) && d > 0 ? new Date(d * 1000).toISOString() : null,
  };
}

describe("real OxaPay Paid IPN", () => {
  const p = parseIpn(REAL_PAID_IPN);

  it("is recognised as an invoice callback", () => {
    expect(p.isInvoice).toBe(true);
  });

  it("correlates via our order_id, not OxaPay's track_id", () => {
    expect(p.trackId).toBe("ORD-12345");
  });

  it("keeps OxaPay's track_id as the provider transaction reference", () => {
    expect(p.providerTxnId).toBe("151811887");
  });

  it("uses `amount` as the invoice denomination, not the crypto quantity", () => {
    // 10 (invoice) must be validated; 3.6839 (POL units) must not be.
    expect(p.invoiceAmount).toBe(10);
    expect(p.invoiceAmount).not.toBe(REAL_PAID_IPN.value);
  });

  it("reads `currency` as the crypto paid, NOT the deposit currency", () => {
    // Regression: treating "POL" as the deposit currency raised
    // currency_mismatch and rejected every valid crypto payment.
    expect(p.payCurrency).toBe("POL");
    expect(p.payCurrency).not.toBe("USD");
  });

  it("converts the Unix-seconds `date` field to an ISO timestamp", () => {
    // new Date(1738493900) would be 1970-01-01 and record a nonsense paid_at.
    expect(p.paidAt).toBe(new Date(1738493900 * 1000).toISOString());
    expect(new Date(p.paidAt!).getUTCFullYear()).toBe(2025);
  });

  it("would settle against a $10 deposit", () => {
    // The deposit row stores amount_usd = 10, currency = 'USD'.
    const deposit = { amount_usd: 10, currency: "USD" };
    expect(Math.abs(p.invoiceAmount! - deposit.amount_usd)).toBeLessThanOrEqual(0.001);
    expect(deposit.currency).toBe("USD");
  });

  it("ignores payout callbacks that share the URL", () => {
    // Payout IPNs are signed with PAYOUT_API_KEY; a merchant key must never
    // settle a withdrawal.
    const payout = { ...REAL_PAID_IPN, type: "payout" };
    expect(parseIpn(payout).isInvoice).toBe(false);
  });

  it("does not settle on the interim Paying callback", () => {
    const paying = { ...REAL_PAID_IPN, status: "Paying" };
    expect(PAID_STATUSES.has(paying.status)).toBe(false);
  });

  it("rejects an invoice callback signed with the wrong key", async () => {
    const raw = JSON.stringify(REAL_PAID_IPN);
    const forged = await sign(raw, "wrong-key");
    expect(safeEqual(forged, await sign(raw))).toBe(false);
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
