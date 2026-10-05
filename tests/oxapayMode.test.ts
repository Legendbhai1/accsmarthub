/**
 * OxaPay sandbox/live mode resolution.
 *
 * This is the gate that decides whether a deposit invoice is real money or
 * test money, so the tests here assert the SAFETY property rather than just
 * the mapping: live mode may only be reached by an explicit server-side
 * setting, and any absent or unrecognised value refuses to invoice at all.
 *
 * The module under test is imported directly from the Edge Function source so
 * the tests and the deployed code cannot drift apart.
 */
import { describe, it, expect } from "vitest";
import { resolveOxaPayMode, SANDBOX_TRUTHY, SANDBOX_FALSY } from "../supabase/functions/_shared/oxapayMode.ts";

describe("resolveOxaPayMode", () => {
  it("selects SANDBOX for every explicit truthy value", () => {
    for (const v of SANDBOX_TRUTHY) {
      const mode = resolveOxaPayMode(v);
      expect(mode, `value ${JSON.stringify(v)}`).toEqual({ ok: true, sandbox: true });
    }
  });

  it("selects LIVE only for an explicit falsy value", () => {
    for (const v of SANDBOX_FALSY) {
      const mode = resolveOxaPayMode(v);
      expect(mode, `value ${JSON.stringify(v)}`).toEqual({ ok: true, sandbox: false });
    }
  });

  it("is case- and whitespace-insensitive", () => {
    expect(resolveOxaPayMode("  TRUE ")).toEqual({ ok: true, sandbox: true });
    expect(resolveOxaPayMode("\tFalse\n")).toEqual({ ok: true, sandbox: false });
    expect(resolveOxaPayMode("Yes")).toEqual({ ok: true, sandbox: true });
  });

  it("handles null and undefined like an unset secret", () => {
    expect(resolveOxaPayMode(null).ok).toBe(false);
    expect(resolveOxaPayMode(undefined).ok).toBe(false);
    expect(resolveOxaPayMode("")).toEqual({ ok: false, reason: expect.any(String) });
  });

  it("FAILS CLOSED when the mode is unset — never defaults to live", () => {
    const mode = resolveOxaPayMode("");
    expect(mode.ok).toBe(false);
    if (!mode.ok) {
      // The error must name the variable so an operator can act on it.
      expect(mode.reason).toContain("OXAPAY_SANDBOX");
    }
  });

  it("FAILS CLOSED on a typo rather than guessing either mode", () => {
    for (const v of ["tru", "live", "prod", "production", "test", "2", "sandbox"]) {
      const mode = resolveOxaPayMode(v);
      expect(mode, `value ${JSON.stringify(v)}`).toMatchObject({ ok: false });
    }
  });

  it("refuses the exact strings a human would plausibly write by mistake", () => {
    // "true " with a trailing non-breaking-style space or a capital is fine,
    // but "yes " is covered above; these are the dangerous near-misses.
    expect(resolveOxaPayMode("ture").ok).toBe(false);
    expect(resolveOxaPayMode("fale").ok).toBe(false);
  });

  it("never returns ok:true without an explicit sandbox boolean", () => {
    for (const v of [null, undefined, "", "maybe", "TRUEE", "0 ", "off ", "off"]) {
      const mode = resolveOxaPayMode(v as string);
      if (mode.ok) {
        expect([true, false]).toContain(mode.sandbox);
      } else {
        expect(mode.reason).toBeTruthy();
      }
    }
  });
});
