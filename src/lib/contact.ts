/**
 * Where AccsMartHub can be reached outside the app.
 *
 * Kept in one module so the channel and the support bot are written down once.
 * Both are linked from the footer, the buyer dashboard and the support page,
 * and a handle that drifts between three literals is a link that silently
 * points at the wrong account.
 *
 * `tests/navigation.test.ts` walks every internal route; these are external
 * `https://t.me/...` destinations, so they are asserted separately in
 * `tests/contact_links.test.ts`.
 */

/** The public announcements channel. */
export const TELEGRAM_CHANNEL = {
  label: "Telegram channel",
  handle: "@accsmarthub",
  url: "https://t.me/accsmarthub",
  description: "Product updates, new categories and maintenance notices.",
} as const;

/** The one-to-one support bot, for help with an order or a payout. */
export const TELEGRAM_SUPPORT = {
  label: "Telegram support",
  handle: "@AccsMartHubbot",
  url: "https://t.me/AccsMartHubbot",
  description: "Message the support bot for help with an order, a deposit or a withdrawal.",
} as const;

export const TELEGRAM_LINKS = [TELEGRAM_CHANNEL, TELEGRAM_SUPPORT] as const;
