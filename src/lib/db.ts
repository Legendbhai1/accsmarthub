import { useSyncExternalStore } from "react";

/* ---------------------------------- types --------------------------------- */

export type Category = {
  slug: string;
  name: string;
  brand: string;
  description: string;
  listingCount: number;
};

export type Seller = {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  sales: number;
  verified: boolean;
  memberSince: string;
  responseTime: string;
};

export type ListingStatus = "active" | "paused" | "sold" | "pending";

export type Listing = {
  id: string;
  title: string;
  category: string;
  brand: string;
  sellerId: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviewCount: number;
  followers: number;
  niche: string;
  description: string;
  features: string[];
  stock: number;
  status: ListingStatus;
  createdAt: string;
  deliveryTime: string;
};

export type Review = {
  id: string;
  listingId: string;
  author: string;
  rating: number;
  date: string;
  text: string;
};

export type OrderStatus =
  | "pending"
  | "in_escrow"
  | "transferring"
  | "completed"
  | "disputed"
  | "refunded";

export type Order = {
  id: string;
  listingId: string;
  listingTitle: string;
  brand: string;
  buyerId: string;
  sellerId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
};

export type DisputeStatus = "open" | "under_review" | "resolved";

export type Dispute = {
  id: string;
  orderId: string;
  orderRef: string;
  listingTitle: string;
  buyerId: string;
  sellerId: string;
  reason: string;
  detail: string;
  amount: number;
  status: DisputeStatus;
  createdAt: string;
  responses: { author: string; role: "buyer" | "seller" | "admin"; text: string; date: string }[];
};

export type Withdrawal = {
  id: string;
  sellerId: string;
  amount: number;
  method: string;
  status: "pending" | "paid";
  requestedAt: string;
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
};

export type Ticket = {
  id: string;
  userId: string;
  subject: string;
  status: "open" | "answered" | "closed";
  createdAt: string;
  messages: { author: string; role: "buyer" | "seller" | "admin" | "support"; text: string; date: string }[];
};

export type AuditEntry = {
  id: string;
  action: string;
  actor: string;
  target: string;
  date: string;
};

export type SellerApplicationStatus = "pending" | "approved" | "rejected";

export type SellerApplication = {
  id: string;
  userId: string;
  name: string;
  email: string;
  storeName: string;
  platformFocus: string;
  experience: string;
  reason: string;
  status: SellerApplicationStatus;
  createdAt: string;
};

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  orders: number;
  spent: number;
  status: "active" | "suspended";
};

export type PaymentRow = {
  id: string;
  orderId: string;
  listingTitle: string;
  buyer: string;
  seller: string;
  amount: number;
  fee: number;
  method: string;
  status: "held" | "released" | "refunded";
  date: string;
};

/* ------------------------------- taxonomy -------------------------------- */

/** The service categories a seller can pick when creating a listing. */
export const SERVICE_CATEGORIES = [
  { slug: "instagram", name: "Instagram", brand: "instagram" },
  { slug: "tiktok", name: "TikTok", brand: "tiktok" },
  { slug: "youtube", name: "YouTube", brand: "youtube" },
  { slug: "x", name: "X (Twitter)", brand: "x" },
  { slug: "facebook", name: "Facebook", brand: "facebook" },
  { slug: "linkedin", name: "LinkedIn", brand: "linkedin" },
  { slug: "discord", name: "Discord", brand: "discord" },
  { slug: "telegram", name: "Telegram", brand: "telegram" },
  { slug: "twitch", name: "Twitch", brand: "twitch" },
  { slug: "pinterest", name: "Pinterest", brand: "pinterest" },
  { slug: "software", name: "Software", brand: "software" },
  { slug: "gmail", name: "Gmail", brand: "gmail" },
  { slug: "gmx", name: "GMX", brand: "gmx" },
  { slug: "webmail", name: "Webmail", brand: "webmail" },
  { slug: "apple", name: "Apple", brand: "apple" },
  { slug: "vpn", name: "VPN", brand: "vpn" },
  { slug: "att", name: "AT&T", brand: "att" },
  { slug: "offline", name: "Offline", brand: "offline" },
];

export const categories: Category[] = [
  { slug: "instagram", name: "Instagram", brand: "instagram", description: "Theme pages, niche hubs and creator accounts.", listingCount: 0 },
  { slug: "tiktok", name: "TikTok", brand: "tiktok", description: "Short-form accounts with proven growth trails.", listingCount: 0 },
  { slug: "youtube", name: "YouTube", brand: "youtube", description: "Monetized channels and evergreen libraries.", listingCount: 0 },
  { slug: "x", name: "X (Twitter)", brand: "x", description: "Aged handles with professional audiences.", listingCount: 0 },
  { slug: "linkedin", name: "LinkedIn", brand: "linkedin", description: "Authority profiles and company pages.", listingCount: 0 },
  { slug: "facebook", name: "Facebook", brand: "facebook", description: "Groups, pages and ad accounts.", listingCount: 0 },
  { slug: "twitch", name: "Twitch", brand: "twitch", description: "Streaming channels with loyal viewers.", listingCount: 0 },
  { slug: "pinterest", name: "Pinterest", brand: "pinterest", description: "Traffic accounts in lifestyle niches.", listingCount: 0 },
  { slug: "telegram", name: "Telegram", brand: "telegram", description: "Channels with engaged subscriber bases.", listingCount: 0 },
  { slug: "discord", name: "Discord", brand: "discord", description: "Established communities and servers.", listingCount: 0 },
];

/* --------------------------- selectors (read-only) --------------------------- */

export function getSeller(id: string): Seller {
  throw new Error("getSeller is a demo helper. Use the Supabase-backed seller profile instead.");
}

export function getCategory(slug: string): Category {
  return categories.find((c) => c.slug === slug) ?? categories[0];
}

export function getReviewsFor(listingId: string): Review[] {
  return [];
}

export function getRelated(listing: Listing, limit = 4): Listing[] {
  return [];
}

/* ------------------- legacy demo constants (compat only) ------------------- */

/**
 * @deprecated Keep this export only so SellerOrders / SellerDisputes can
 * compile while they still reference DEMO_SELLER_ID. Once those pages are
 * rewritten to read real Supabase orders, remove this constant.
 */
export const DEMO_SELLER_ID = "demo-seller-id";

/**
 * @deprecated Empty in production. These were seeded demo collections and are
 * no longer authoritative. Admin pages that still import them should move to
 * the Supabase-backed readers in `src/lib/supabaseQueries.ts`.
 */
export const auditLog: AuditEntry[] = [];
export const payments: PaymentRow[] = [];
export const users: UserRow[] = [];

/* ----------------------- production-safe shims ----------------------- */

const emptyState = {
  listings: [] as Listing[],
  orders: [] as Order[],
  disputes: [] as Dispute[],
  withdrawals: [] as Withdrawal[],
  notifications: [] as Notification[],
  tickets: [] as Ticket[],
  sellerApplications: [] as SellerApplication[],
};

function noopSubscribe(_fn: () => void): () => void {
  return () => {};
}

function getEmptySnapshot(): typeof emptyState {
  return emptyState;
}

/**
 * Production-safe shim for pages that still call `useDb()`.
 *
 * In the Supabase-backed app, seller/buyer/admin screens read from real
 * tables via `src/lib/supabaseQueries.ts`. This hook exists only so those
 * pages keep rendering during the migration rather than crashing.
 */
export function useDb() {
  return useSyncExternalStore(noopSubscribe, getEmptySnapshot, getEmptySnapshot);
}

/**
 * Production-safe shim for the legacy `api` object.
 *
 * Every method here throws with a message that points to the real
 * Supabase-backed implementation. Pages that still call `api.*` will fail
 * loudly with an actionable message instead of silently mutating demo state.
 */
export const api = {
  createListing(_input: Omit<Listing, "id" | "createdAt" | "status">): Listing {
    throw new Error("api.createListing is not implemented in the Supabase-backed app. Use the seller listings flow.");
  },
  updateListing(_id: string, _patch: Partial<Listing>): void {
    throw new Error("api.updateListing is not implemented in the Supabase-backed app.");
  },
  deleteListing(_id: string): void {
    throw new Error("api.deleteListing is not implemented in the Supabase-backed app.");
  },
  adjustStock(_id: string, _delta: number): void {
    throw new Error("api.adjustStock is not implemented in the Supabase-backed app. Use the Supabase listings mutation.");
  },
  setStock(_id: string, _value: number): void {
    throw new Error("api.setStock is not implemented in the Supabase-backed app.");
  },
  placeOrder(_input: {
    listingId: string;
    listingTitle: string;
    brand: string;
    sellerId: string;
    quantity: number;
    unitPrice: number;
  }): Order {
    throw new Error("api.placeOrder is not implemented in the Supabase-backed app. Use the Supabase checkout mutation.");
  },
  advanceOrder(_orderId: string): void {
    throw new Error("api.advanceOrder is not implemented in the Supabase-backed app. Supabase uses confirmDelivery/markOrderDelivered.");
  },
  openDispute(_orderId: string, _reason: string, _detail: string): Dispute {
    throw new Error("api.openDispute is not implemented in the Supabase-backed app. Use the Supabase openDispute mutation.");
  },
  addDisputeResponse(_disputeId: string, _response: Dispute["responses"][number]): void {
    throw new Error("api.addDisputeResponse is not implemented in the Supabase-backed app.");
  },
  resolveDispute(_disputeId: string, _outcome: "refund_buyer" | "release_seller"): void {
    throw new Error("api.resolveDispute is not implemented in the Supabase-backed app. Use the Supabase resolveDispute mutation.");
  },
  requestWithdrawal(_sellerId: string, _amount: number, _method: string): Withdrawal {
    throw new Error("api.requestWithdrawal is not implemented in the Supabase-backed app.");
  },
  createTicket(_userId: string, _subject: string): Ticket {
    throw new Error("api.createTicket is not implemented in the Supabase-backed app.");
  },
  applyForStore(_input: {
    userId: string;
    name: string;
    email: string;
    storeName: string;
    platformFocus: string;
    experience: string;
    reason: string;
  }): SellerApplication {
    throw new Error("api.applyForStore is not implemented in the Supabase-backed app. Use the Supabase store submission.");
  },
  setApplicationStatus(_applicationId: string, _status: SellerApplicationStatus): void {
    throw new Error("api.setApplicationStatus is not implemented in the Supabase-backed app.");
  },
  markNotificationsRead(_userId: string): void {
    throw new Error("api.markNotificationsRead is not implemented in the Supabase-backed app. Use the Supabase markNotificationsRead mutation.");
  },
};
