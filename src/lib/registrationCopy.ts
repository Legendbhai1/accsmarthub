/**
 * What the "check your inbox" screen says, per kind of link we sent.
 *
 * Registration and passwordless sign-in both end on the same screen, and they
 * are not the same message: one creates an account and one opens an existing
 * one. The screen used to say "Check your email" for both, which told a new
 * user nothing about what the link would do or how long it lasts.
 *
 * The copy lives here rather than inline in the page so it can be asserted as a
 * whole — a test can check that the registration wording promises activation,
 * names the address, and never claims a guarantee the backend cannot make
 * ("escrow"). Keep the wording in step with `supabase/email-templates/`, which
 * is the other half of the same conversation.
 */

export type SentReason = "register" | "link";

export interface SentStep {
  title: string;
  detail: string;
}

export interface SentCopy {
  /** The screen heading. */
  heading: string;
  /** The sentence under it, naming the address the mail went to. */
  lead: string;
  /** What happens next, in order. */
  steps: SentStep[];
  /** The resend button, which re-sends the matching kind of link. */
  resendLabel: string;
  /** The confirmation toast's title and body. */
  toastTitle: string;
  toastBody: string;
}

/**
 * Build the screen copy for the link we just sent.
 *
 * `email` is interpolated, so callers pass the normalised address they actually
 * sent to rather than a raw field.
 */
export function sentCopy(reason: SentReason, email: string): SentCopy {
  if (reason === "register") {
    return {
      heading: "Confirm your email to activate your account",
      lead: `We sent a confirmation link to ${email}. Opening it finishes setting up your account.`,
      steps: [
        {
          title: "Open the email",
          detail: `Look for a message from AccsMartHub in the inbox for ${email}. It arrives within a minute or two.`,
        },
        {
          title: "Click the confirmation link",
          detail:
            "The link opens AccsMartHub and activates the account. It works once and expires shortly, so use it soon.",
        },
        {
          title: "Start buying and selling",
          detail:
            "Your account is ready the moment the link opens. Open a store any time from Seller Studio when you want to sell.",
        },
      ],
      resendLabel: "Resend confirmation link",
      toastTitle: "Confirmation link sent",
      toastBody: `Check ${email} and click the link to activate your account.`,
    };
  }

  return {
    heading: "Check your email to sign in",
    lead: `We sent a sign-in link to ${email}. Opening it signs you in — there is no password to remember.`,
    steps: [
      {
        title: "Open the email",
        detail: `Look for a message from AccsMartHub in the inbox for ${email}.`,
      },
      {
        title: "Click the sign-in link",
        detail:
          "It signs you in and takes you to your account. The link works once and expires shortly.",
      },
    ],
    resendLabel: "Resend sign-in link",
    toastTitle: "Sign-in link sent",
    toastBody: `Check ${email} and click the link to continue.`,
  };
}

/**
 * Why we confirm addresses at all, shown under the steps.
 *
 * One sentence, and the only place the reason is stated: verification is what
 * keeps one person from opening a fresh account after every dispute.
 */
export const CONFIRMATION_NOTE =
  "Confirming your address is what keeps one person from opening a fresh account after every dispute.";

/** The small print under the steps, shared by both kinds of link. */
export const SENT_FOOTNOTE =
  "Open the link in the same browser you signed up in, and check your spam folder if it has not arrived after a minute.";
