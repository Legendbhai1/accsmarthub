import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFIRMATION_NOTE,
  SENT_FOOTNOTE,
  sentCopy,
} from "../src/lib/registrationCopy";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * The message a new user reads after registering.
 *
 * Registration ends with an email rather than a session, so this copy is the
 * whole of the user's instruction. Two failure modes matter:
 *
 *   * it must say the account is *not yet active*, or a user assumes the email
 *     is optional and never confirms;
 *   * it must not promise a guarantee the backend cannot make — the funds model
 *     is an internal ledger, so "escrow" is a claim we cannot honour.
 */
describe("the registration message", () => {
  const copy = sentCopy("register", "buyer@example.com");

  it("names the address the mail actually went to", () => {
    expect(copy.lead).toContain("buyer@example.com");
  });

  it("says the account is activated by the link", () => {
    expect(copy.heading.toLowerCase()).toContain("activate");
    expect(copy.lead.toLowerCase()).toMatch(/finish|activat/);
  });

  it("tells the reader the link is single-use and expires", () => {
    const all = copy.steps.map((s) => s.detail).join(" ");
    expect(all.toLowerCase()).toContain("once");
    expect(all.toLowerCase()).toContain("expire");
  });

  it("is distinct from the passwordless sign-in message", () => {
    const link = sentCopy("link", "buyer@example.com");
    expect(copy.heading).not.toBe(link.heading);
    expect(copy.lead).not.toBe(link.lead);
    // The sign-in screen is about opening an account, not creating one.
    expect(link.heading.toLowerCase()).toContain("sign in");
  });

  it("never promises escrow", () => {
    // The backend holds funds in an internal ledger and has no escrow
    // provider. The user-facing word is "payment protection".
    const all = JSON.stringify(copy) + CONFIRMATION_NOTE + SENT_FOOTNOTE;
    expect(all.toLowerCase()).not.toContain("escrow");
  });
});

describe("the copy is wired into the auth page, not duplicated", () => {
  it("renders the module's heading, steps and resend label", () => {
    const page = read("src/pages/flow/SupabaseAuth.tsx");
    expect(page).toMatch(/import \{[\s\S]*sentCopy[\s\S]*\} from "@\/lib\/registrationCopy"/);
    expect(page).toMatch(/sentCopy\(sentFor, normalized\)/);
    expect(page).toMatch(/sent\.heading/);
    expect(page).toMatch(/sent\.steps\.map/);
    expect(page).toMatch(/sent\.resendLabel/);
  });

  it("uses the module for the toast as well, so both say the same thing", () => {
    const page = read("src/pages/flow/SupabaseAuth.tsx");
    expect(page).toMatch(/toast\.success\(copy\.toastTitle/);
  });
});

describe("the email template matches the on-screen message", () => {
  const html = read("supabase/email-templates/email-verification.html");

  it("states that the link is single-use and expires", () => {
    expect(html.toLowerCase()).toContain("works once and expires");
  });

  it("does not call the held-funds model escrow", () => {
    // The email is the other half of the registration conversation and must
    // make the same promise the app does.
    expect(html.toLowerCase()).not.toContain("escrow");
  });
});
