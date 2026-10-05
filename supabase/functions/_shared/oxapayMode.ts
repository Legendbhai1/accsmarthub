/**
 * Which OxaPay environment invoices are created in.
 *
 * This is a PURE function on purpose. The Edge Function hands it the raw
 * `OXAPAY_SANDBOX` value; the vitest suite hands it test strings. Nothing here
 * may touch `Deno`, or the module becomes untestable from Node.
 *
 * WHY IT FAILS CLOSED
 *   Money movement must never be decided by a default. If the value is missing
 *   or unrecognised the function refuses to create ANY invoice, rather than
 *   quietly assuming "live" (which could mint real invoices the moment a key
 *   is pasted in) or quietly assuming "sandbox" (which would let a test
 *   callback settle a real deposit). Going live is a deliberate act: set
 *   OXAPAY_SANDBOX=false explicitly.
 */

export type OxaPayMode =
  | { ok: true; sandbox: boolean }
  | { ok: false; reason: string };

/** Values that explicitly select OxaPay's test environment. */
export const SANDBOX_TRUTHY = ["true", "1", "yes", "on"] as const;

/** Values that explicitly select OxaPay's live environment. */
export const SANDBOX_FALSY = ["false", "0", "no", "off"] as const;

export function resolveOxaPayMode(raw: string | null | undefined): OxaPayMode {
  const value = (raw ?? "").trim().toLowerCase();

  // Absent is NOT the same as "live". An operator who adds the merchant key
  // but forgets the mode gets no invoices and a clear error, not real ones.
  if (value === "") {
    return {
      ok: false,
      reason:
        "OXAPAY_SANDBOX is not set. Deposits stay off until the mode is chosen explicitly — set it to true for OxaPay test mode, or false for live.",
    };
  }

  if ((SANDBOX_TRUTHY as readonly string[]).includes(value)) {
    return { ok: true, sandbox: true };
  }
  if ((SANDBOX_FALSY as readonly string[]).includes(value)) {
    return { ok: true, sandbox: false };
  }

  // A typo must not be interpreted as either setting.
  return {
    ok: false,
    reason:
      "OXAPAY_SANDBOX is set to a value this function does not recognise, so deposits stay off rather than guess. Use true (test mode) or false (live).",
  };
}
