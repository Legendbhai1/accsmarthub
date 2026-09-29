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
  category: string; // category slug
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
  createdAt: string; // ISO
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

/* ------------------------------- demo data -------------------------------- */

const sellers: Seller[] = [
  { id: "s-1", name: "Meridian Digital", rating: 4.9, reviews: 1240, sales: 3120, verified: true, memberSince: "2024-03-12", responseTime: "Under 1 hour" },
  { id: "s-2", name: "Harborlight Accounts", rating: 4.8, reviews: 986, sales: 2450, verified: true, memberSince: "2024-01-20", responseTime: "Under 2 hours" },
  { id: "s-3", name: "Crescent Row Media", rating: 4.7, reviews: 742, sales: 1890, verified: true, memberSince: "2024-07-05", responseTime: "Under 3 hours" },
  { id: "s-4", name: "ArcherPeak Holdings", rating: 4.6, reviews: 613, sales: 1520, verified: true, memberSince: "2025-02-14", responseTime: "Under 2 hours" },
  { id: "s-5", name: "Vantage Social", rating: 4.9, reviews: 1105, sales: 2760, verified: true, memberSince: "2024-10-02", responseTime: "Under 4 hours" },
  { id: "s-6", name: "NorthGate Trading", rating: 4.5, reviews: 322, sales: 810, verified: true, memberSince: "2025-05-19", responseTime: "Under 2 hours" },
  { id: "s-7", name: "Solstice Brokers", rating: 4.6, reviews: 547, sales: 1340, verified: true, memberSince: "2024-11-11", responseTime: "Under 5 hours" },
  { id: "s-8", name: "Lumenpath Listings", rating: 4.3, reviews: 189, sales: 420, verified: false, memberSince: "2025-04-27", responseTime: "Under 6 hours" },
];

const categories: Category[] = [
  { slug: "instagram", name: "Instagram", brand: "instagram", description: "Theme pages, niche hubs and creator accounts.", listingCount: 512 },
  { slug: "tiktok", name: "TikTok", brand: "tiktok", description: "Short-form accounts with proven growth trails.", listingCount: 438 },
  { slug: "youtube", name: "YouTube", brand: "youtube", description: "Monetized channels and evergreen libraries.", listingCount: 286 },
  { slug: "x", name: "X (Twitter)", brand: "x", description: "Aged handles with professional audiences.", listingCount: 241 },
  { slug: "linkedin", name: "LinkedIn", brand: "linkedin", description: "Authority profiles and company pages.", listingCount: 124 },
  { slug: "facebook", name: "Facebook", brand: "facebook", description: "Groups, pages and ad accounts.", listingCount: 198 },
  { slug: "twitch", name: "Twitch", brand: "twitch", description: "Streaming channels with loyal viewers.", listingCount: 96 },
  { slug: "pinterest", name: "Pinterest", brand: "pinterest", description: "Traffic accounts in lifestyle niches.", listingCount: 87 },
  { slug: "telegram", name: "Telegram", brand: "telegram", description: "Channels with engaged subscriber bases.", listingCount: 152 },
  { slug: "discord", name: "Discord", brand: "discord", description: "Established communities and servers.", listingCount: 74 },
];

const L = (
  id: string,
  title: string,
  category: string,
  brand: string,
  sellerId: string,
  price: number,
  followers: number,
  niche: string,
  rating: number,
  reviewCount: number,
  daysAgo: number,
  stock: number,
  status: ListingStatus,
  oldPrice?: number,
): Listing => ({
  id,
  title,
  category,
  brand,
  sellerId,
  price,
  oldPrice,
  rating,
  reviewCount,
  followers,
  niche,
  description: "",
  features: [],
  stock,
  status,
  createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
  deliveryTime: "Within 24 hours",
});

export const listings: Listing[] = [
  L("l-001", "Aurora Lifestyle Theme Page", "instagram", "instagram", "s-1", 7400, 892000, "Lifestyle", 4.8, 214, 2, 1, "active", 8900),
  L("l-002", "FitFuel Daily Fitness Account", "tiktok", "tiktok", "s-2", 3900, 340000, "Fitness", 4.6, 143, 1, 1, "active", 4600),
  L("l-003", "The Workshop Tool Reviews", "youtube", "youtube", "s-5", 9800, 64000, "DIY & Tools", 4.9, 241, 4, 1, "active", 11500),
  L("l-004", "UrbanX Finance Commentary", "x", "x", "s-4", 4200, 95000, "Finance", 4.5, 88, 3, 1, "active"),
  L("l-005", "Atlas Advisory Authority Profile", "linkedin", "linkedin", "s-1", 6200, 24000, "B2B Consulting", 4.9, 133, 6, 1, "active"),
  L("l-006", "Kitchen & Craft Traffic Account", "pinterest", "pinterest", "s-5", 1850, 45000, "Home & Recipes", 4.8, 121, 5, 1, "active"),
  L("l-007", "MarketPulse Investing Channel", "telegram", "telegram", "s-4", 3400, 58000, "Markets", 4.7, 97, 8, 1, "active"),
  L("l-008", "GridIron Gaming Highlights", "tiktok", "tiktok", "s-6", 8200, 510000, "Gaming", 4.9, 264, 9, 1, "active", 9900),
  L("l-009", "DealStream Bargain Community", "facebook", "facebook", "s-7", 4100, 74000, "Deals", 4.5, 156, 11, 1, "active"),
  L("l-010", "Clutch Arena Partnered Channel", "twitch", "twitch", "s-6", 6900, 42000, "FPS Streaming", 4.8, 117, 12, 1, "active"),
  L("l-011", "Runway Notes Beauty Account", "tiktok", "tiktok", "s-3", 4600, 190000, "Beauty", 4.9, 178, 7, 1, "active"),
  L("l-012", "Studio Nine Shorts Channel", "youtube", "youtube", "s-7", 7800, 120000, "Entertainment", 4.8, 149, 14, 1, "active"),
  L("l-013", "Globe Hoppers Travel Page", "instagram", "instagram", "s-8", 5600, 620000, "Travel", 4.3, 64, 10, 1, "active"),
  L("l-014", "HomeFront Interior Design Page", "instagram", "instagram", "s-2", 3200, 130000, "Interior", 4.6, 108, 15, 1, "active"),
  L("l-015", "ServerCraft Tech Community", "discord", "discord", "s-1", 2600, 31000, "Technology", 4.7, 71, 18, 1, "active"),
  L("l-016", "Founders Circle Company Page", "linkedin", "linkedin", "s-5", 2750, 18000, "Startups", 4.6, 82, 20, 1, "active"),
  L("l-017", "TechPrism News Handle", "x", "x", "s-7", 2900, 48000, "Technology", 4.5, 76, 22, 1, "active"),
  L("l-018", "Quiet Focus Lofi Channel", "youtube", "youtube", "s-3", 5100, 31000, "Music", 4.8, 187, 25, 1, "active"),
  L("l-019", "The Daily Plate Recipe Page", "instagram", "instagram", "s-3", 2350, 210000, "Food", 4.7, 162, 28, 1, "paused"),
  L("l-020", "HustleHub Business Page", "facebook", "facebook", "s-8", 2250, 96000, "Entrepreneurship", 4.4, 52, 30, 1, "pending"),
  L("l-021", "Prime Clips Highlight Hub", "youtube", "youtube", "s-2", 4300, 88000, "Sports", 4.7, 95, 6, 1, "sold"),
  L("l-022", "Daily Grind Coffee Community", "instagram", "instagram", "s-6", 1950, 54000, "Food & Drink", 4.5, 77, 16, 1, "active"),
];

for (const item of listings) {
  item.description = `${item.title} is a well-maintained ${item.niche.toLowerCase()} account with ${item.followers.toLocaleString()} followers and a clean, documented history. Engagement is organic and consistent, with no strikes, restrictions or policy violations on record. Ownership documentation and a full analytics export are included with the transfer.`;
  item.features = [
    "Verified proof of ownership and transfer record",
    "Original registration email included with full access",
    "90-day audience and revenue analytics export",
    "Guided handover call with the seller",
    "Escrow-protected transfer with dispute coverage",
  ];
}

const reviews: Review[] = [
  { id: "r-1", listingId: "l-001", author: "Priya S.", rating: 5, date: "2026-09-12", text: "Escrow released the same day and the transfer finished in under two hours. Analytics matched the listing exactly." },
  { id: "r-2", listingId: "l-001", author: "Marcus T.", rating: 5, date: "2026-09-08", text: "Follower quality, engagement, sponsorship pipeline — everything checked out. The onboarding call was a nice touch." },
  { id: "r-3", listingId: "l-001", author: "Lena K.", rating: 4, date: "2026-08-30", text: "Flawless transfer. Would have liked region-level media kit numbers, but the seller compiled them when asked." },
  { id: "r-4", listingId: "l-002", author: "Diego R.", rating: 5, date: "2026-09-14", text: "Payout history verified and the account switched over without a hiccup." },
  { id: "r-5", listingId: "l-002", author: "Amara O.", rating: 4, date: "2026-09-02", text: "Smooth purchase. Verification took a day longer than advertised, but support kept me informed." },
  { id: "r-6", listingId: "l-003", author: "Sofia M.", rating: 5, date: "2026-09-10", text: "Revenue statements and the strike-free report made this an easy decision." },
  { id: "r-7", listingId: "l-003", author: "Jon P.", rating: 5, date: "2026-08-29", text: "Professional operation. License portfolio walked through before escrow released." },
  { id: "r-8", listingId: "l-005", author: "Hannah W.", rating: 5, date: "2026-09-15", text: "The newsletter list alone paid for the purchase. First sponsored send converted at 6%." },
  { id: "r-9", listingId: "l-005", author: "Tom B.", rating: 5, date: "2026-09-05", text: "Documents, call, support — a textbook professional handover." },
  { id: "r-10", listingId: "l-006", author: "Ella F.", rating: 5, date: "2026-09-11", text: "Traffic numbers were real; my blog saw the spike within days." },
  { id: "r-11", listingId: "l-008", author: "Ines V.", rating: 5, date: "2026-09-13", text: "Both sponsor contracts transferred as promised, along with the content pipeline." },
  { id: "r-12", listingId: "l-011", author: "Felix A.", rating: 5, date: "2026-09-06", text: "Two brand contracts transferred with the account, just as listed." },
  { id: "r-13", listingId: "l-012", author: "Nadia H.", rating: 4, date: "2026-08-27", text: "Clean monetization documentation. Formats transfer-ready and well organized." },
  { id: "r-14", listingId: "l-015", author: "Owen C.", rating: 5, date: "2026-09-04", text: "Bots, roles, moderation guidelines — everything inherited in one pass." },
  { id: "r-15", listingId: "l-018", author: "Grace H.", rating: 5, date: "2026-09-07", text: "Watch time never dipped after the transfer. License portfolio handled perfectly." },
];

const orders: Order[] = [
  { id: "o-1001", listingId: "l-021", listingTitle: "Prime Clips Highlight Hub", brand: "youtube", buyerId: "u-me", sellerId: "s-2", quantity: 1, unitPrice: 4300, total: 4300, status: "in_escrow", createdAt: "2026-09-20T10:24:00Z", updatedAt: "2026-09-20T10:24:00Z" },
  { id: "o-0996", listingId: "l-004", listingTitle: "UrbanX Finance Commentary", brand: "x", buyerId: "u-me", sellerId: "s-4", quantity: 1, unitPrice: 4200, total: 4200, status: "completed", createdAt: "2026-09-08T14:02:00Z", updatedAt: "2026-09-09T09:15:00Z" },
  { id: "o-0971", listingId: "l-006", listingTitle: "Kitchen & Craft Traffic Account", brand: "pinterest", buyerId: "u-me", sellerId: "s-5", quantity: 1, unitPrice: 1850, total: 1850, status: "completed", createdAt: "2026-08-27T09:40:00Z", updatedAt: "2026-08-28T11:05:00Z" },
  { id: "o-1004", listingId: "l-010", listingTitle: "Clutch Arena Partnered Channel", brand: "twitch", buyerId: "u-buyer2", sellerId: "s-6", quantity: 1, unitPrice: 6900, total: 6900, status: "transferring", createdAt: "2026-09-25T16:12:00Z", updatedAt: "2026-09-26T08:30:00Z" },
  { id: "o-0998", listingId: "l-011", listingTitle: "Runway Notes Beauty Account", brand: "tiktok", buyerId: "u-buyer3", sellerId: "s-3", quantity: 1, unitPrice: 4600, total: 4600, status: "disputed", createdAt: "2026-09-10T12:00:00Z", updatedAt: "2026-09-12T10:45:00Z" },
];

const disputes: Dispute[] = [
  {
    id: "d-01",
    orderId: "o-0998",
    orderRef: "#o-0998",
    listingTitle: "Runway Notes Beauty Account",
    buyerId: "u-buyer3",
    sellerId: "s-3",
    reason: "Not as described",
    detail: "Reported engagement rate is materially lower than the listing stated. Requesting partial refund or transfer reversal.",
    amount: 4600,
    status: "open",
    createdAt: "2026-09-12T10:45:00Z",
    responses: [
      { author: "Crescent Row Media", role: "seller", text: "Engagement fluctuates seasonally; 30-day average matches the listing. Sharing analytics export for review.", date: "2026-09-12T15:30:00Z" },
    ],
  },
  {
    id: "d-02",
    orderId: "o-0960",
    orderRef: "#o-0960",
    listingTitle: "Skyline Motivation Page",
    buyerId: "u-buyer4",
    sellerId: "s-7",
    reason: "Transfer failed",
    detail: "Recovery credentials did not work at handover. Escrow should be returned.",
    amount: 2800,
    status: "under_review",
    createdAt: "2026-09-05T08:20:00Z",
    responses: [
      { author: "Solstice Brokers", role: "seller", text: "Credentials were confirmed valid at listing time. Cooperating with review.", date: "2026-09-05T12:10:00Z" },
      { author: "AccsMartHub Trust", role: "admin", text: "Evidence received from both parties. Review in progress, decision within 48 hours.", date: "2026-09-06T09:00:00Z" },
    ],
  },
  {
    id: "d-03",
    orderId: "o-0902",
    orderRef: "#o-0902",
    listingTitle: "Pet Lovers Community Group",
    buyerId: "u-buyer5",
    sellerId: "s-2",
    reason: "Not as described",
    detail: "Member activity far below the claimed daily active count.",
    amount: 1500,
    status: "resolved",
    createdAt: "2026-08-18T13:00:00Z",
    responses: [
      { author: "AccsMartHub Trust", role: "admin", text: "Reviewed analytics from both sides. Partial refund of 40% approved and processed from escrow.", date: "2026-08-21T17:25:00Z" },
    ],
  },
];

const withdrawals: Withdrawal[] = [
  { id: "w-01", sellerId: "s-1", amount: 12500, method: "Bank transfer", status: "paid", requestedAt: "2026-09-15T09:00:00Z" },
  { id: "w-02", sellerId: "s-1", amount: 6800, method: "USDT (TRC-20)", status: "pending", requestedAt: "2026-09-26T14:30:00Z" },
  { id: "w-03", sellerId: "s-5", amount: 4300, method: "Bank transfer", status: "paid", requestedAt: "2026-09-10T11:20:00Z" },
];

const notifications: Notification[] = [
  { id: "n-1", userId: "u-me", title: "Escrow funded", body: "Your payment for Prime Clips Highlight Hub is held in escrow. The seller has been notified to begin the transfer.", date: "2026-09-20T10:25:00Z", read: false },
  { id: "n-2", userId: "u-me", title: "Transfer completed", body: "UrbanX Finance Commentary has been marked completed. Funds released to the seller.", date: "2026-09-09T09:16:00Z", read: true },
  { id: "n-3", userId: "u-me", title: "Welcome to AccsMartHub", body: "Verify your email to unlock higher purchase limits and seller tools.", date: "2026-08-20T08:00:00Z", read: true },
];

const tickets: Ticket[] = [
  {
    id: "t-01",
    userId: "u-me",
    subject: "Transfer window extension",
    status: "answered",
    createdAt: "2026-09-19T09:00:00Z",
    messages: [
      { author: "You", role: "buyer", text: "The seller needs two more days to gather analytics exports. Can the escrow window be extended?", date: "2026-09-19T09:00:00Z" },
      { author: "Support Team", role: "support", text: "Escrow window extended by 72 hours at the seller's request. No action needed from you.", date: "2026-09-19T13:40:00Z" },
    ],
  },
];

const auditLog: AuditEntry[] = [
  { id: "a-01", action: "listing.suspend", actor: "admin", target: "l-020 · HustleHub Business Page", date: "2026-09-24T11:00:00Z" },
  { id: "a-02", action: "user.suspend", actor: "admin", target: "u-7721 · member", date: "2026-09-22T15:20:00Z" },
  { id: "a-03", action: "dispute.resolve", actor: "admin", target: "d-03 · partial refund 40%", date: "2026-08-21T17:25:00Z" },
  { id: "a-04", action: "seller.verify", actor: "admin", target: "s-6 · NorthGate Trading", date: "2026-08-14T10:05:00Z" },
];

const sellerApplications: SellerApplication[] = [
  {
    id: "sa-01",
    userId: "u-1001",
    name: "Jordan Ellis",
    email: "jordan@example.com",
    storeName: "Ellis Growth Media",
    platformFocus: "Instagram & TikTok theme pages",
    experience: "Ran two niche pages to 100k+ followers; 3 years selling digital assets on forums.",
    reason: "I want to list verified Instagram theme pages with documented analytics.",
    status: "pending",
    createdAt: "2026-09-27T09:30:00Z",
  },
];

/* --------------------------------- store ---------------------------------- */

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "buyer" | "seller" | "admin";
  status: "active" | "suspended";
  joined: string;
  orders: number;
  spent: number;
};

export const users: UserRow[] = [
  { id: "u-1001", name: "Jordan Ellis", email: "jordan@example.com", role: "buyer", status: "active", joined: "2026-06-14", orders: 3, spent: 10450 },
  { id: "u-1002", name: "Casey Nguyen", email: "casey@example.com", role: "seller", status: "active", joined: "2026-05-02", orders: 12, spent: 0 },
  { id: "u-1003", name: "Riley Fox", email: "riley@example.com", role: "buyer", status: "suspended", joined: "2026-08-19", orders: 1, spent: 320 },
  { id: "u-1004", name: "Morgan Diaz", email: "morgan@example.com", role: "seller", status: "active", joined: "2026-03-28", orders: 27, spent: 0 },
  { id: "u-1005", name: "Avery Kim", email: "avery@example.com", role: "buyer", status: "active", joined: "2026-07-08", orders: 2, spent: 6150 },
];

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

export const payments: PaymentRow[] = [
  { id: "pay-01", orderId: "o-1001", listingTitle: "Prime Clips Highlight Hub", buyer: "Jordan Ellis", seller: "Harborlight Accounts", amount: 4300, fee: 129, method: "Card", status: "held", date: "2026-09-20" },
  { id: "pay-02", orderId: "o-1004", listingTitle: "Clutch Arena Partnered Channel", buyer: "Avery Kim", seller: "NorthGate Trading", amount: 6900, fee: 207, method: "Crypto", status: "held", date: "2026-09-25" },
  { id: "pay-03", orderId: "o-0996", listingTitle: "UrbanX Finance Commentary", buyer: "Jordan Ellis", seller: "ArcherPeak Holdings", amount: 4200, fee: 126, method: "Card", status: "released", date: "2026-09-09" },
  { id: "pay-04", orderId: "o-0998", listingTitle: "Runway Notes Beauty Account", buyer: "Casey Nguyen", seller: "Crescent Row Media", amount: 4600, fee: 138, method: "Card", status: "held", date: "2026-09-10" },
  { id: "pay-05", orderId: "o-0902", listingTitle: "Pet Lovers Community Group", buyer: "Riley Fox", seller: "Harborlight Accounts", amount: 1500, fee: 45, method: "Bank", status: "refunded", date: "2026-08-21" },
];

/* ------------------------------ reactive core ------------------------------ */

type State = {
  listings: Listing[];
  orders: Order[];
  disputes: Dispute[];
  withdrawals: Withdrawal[];
  notifications: Notification[];
  tickets: Ticket[];
  sellerApplications: SellerApplication[];
};

let state: State = {
  listings: [...listings],
  orders: [...orders],
  disputes: [...disputes],
  withdrawals: [...withdrawals],
  notifications: [...notifications],
  tickets: [...tickets],
  sellerApplications: [...sellerApplications],
};

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): State {
  return state;
}

export function useDb() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/* ------------------------------ mock API layer ----------------------------- */

export const api = {
  createListing(input: Omit<Listing, "id" | "createdAt" | "status">): Listing {
    const listing: Listing = {
      ...input,
      id: `l-${Math.random().toString(36).slice(2, 8)}`,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    state = { ...state, listings: [listing, ...state.listings] };
    emit();
    return listing;
  },

  updateListing(id: string, patch: Partial<Listing>): void {
    state = {
      ...state,
      listings: state.listings.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    };
    emit();
  },

  deleteListing(id: string): void {
    state = { ...state, listings: state.listings.filter((l) => l.id !== id) };
    emit();
  },

  placeOrder(input: {
    listingId: string;
    listingTitle: string;
    brand: string;
    sellerId: string;
    quantity: number;
    unitPrice: number;
  }): Order {
    // NOTE: in production the price/stock come from the server, never the client.
    const listing = state.listings.find((l) => l.id === input.listingId);
    if (!listing || listing.status !== "active" || listing.stock < input.quantity) {
      throw new Error("Listing is no longer available");
    }
    const order: Order = {
      id: `o-${Math.floor(1000 + Math.random() * 9000)}`,
      listingId: input.listingId,
      listingTitle: listing.title,
      brand: listing.brand,
      buyerId: "u-me",
      sellerId: listing.sellerId,
      quantity: input.quantity,
      unitPrice: listing.price,
      total: listing.price * input.quantity,
      status: "in_escrow",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state = {
      ...state,
      orders: [order, ...state.orders],
      listings: state.listings.map((l) =>
        l.id === input.listingId ? { ...l, stock: l.stock - input.quantity, status: l.stock - input.quantity <= 0 ? "sold" : l.status } : l,
      ),
    };
    emit();
    return order;
  },

  advanceOrder(orderId: string): void {
    const flow: OrderStatus[] = ["pending", "in_escrow", "transferring", "completed"];
    state = {
      ...state,
      orders: state.orders.map((o) => {
        if (o.id !== orderId) return o;
        const idx = flow.indexOf(o.status);
        const next = flow[Math.min(idx + 1, flow.length - 1)];
        return { ...o, status: next, updatedAt: new Date().toISOString() };
      }),
    };
    emit();
  },

  openDispute(orderId: string, reason: string, detail: string): Dispute {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) throw new Error("Order not found");
    const dispute: Dispute = {
      id: `d-${Math.random().toString(36).slice(2, 6)}`,
      orderId: order.id,
      orderRef: `#${order.id}`,
      listingTitle: order.listingTitle,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      reason,
      detail,
      amount: order.total,
      status: "open",
      createdAt: new Date().toISOString(),
      responses: [],
    };
    state = {
      ...state,
      disputes: [dispute, ...state.disputes],
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status: "disputed", updatedAt: new Date().toISOString() } : o,
      ),
    };
    emit();
    return dispute;
  },

  addDisputeResponse(disputeId: string, response: Dispute["responses"][number]): void {
    state = {
      ...state,
      disputes: state.disputes.map((d) =>
        d.id === disputeId
          ? {
              ...d,
              status: d.status === "open" ? "under_review" : d.status,
              responses: [...d.responses, response],
            }
          : d,
      ),
    };
    emit();
  },

  resolveDispute(disputeId: string, outcome: "refund_buyer" | "release_seller"): void {
    state = {
      ...state,
      disputes: state.disputes.map((d) =>
        d.id === disputeId ? { ...d, status: "resolved" } : d,
      ),
      orders: state.orders.map((o) => {
        const dispute = state.disputes.find((d) => d.id === disputeId);
        if (!dispute || o.id !== dispute.orderId) return o;
        return {
          ...o,
          status: outcome === "refund_buyer" ? "refunded" : "completed",
          updatedAt: new Date().toISOString(),
        };
      }),
    };
    emit();
  },

  requestWithdrawal(sellerId: string, amount: number, method: string): Withdrawal {
    const w: Withdrawal = {
      id: `w-${Math.random().toString(36).slice(2, 6)}`,
      sellerId,
      amount,
      method,
      status: "pending",
      requestedAt: new Date().toISOString(),
    };
    state = { ...state, withdrawals: [w, ...state.withdrawals] };
    emit();
    return w;
  },

  createTicket(userId: string, subject: string): Ticket {
    const t: Ticket = {
      id: `t-${Math.random().toString(36).slice(2, 6)}`,
      userId,
      subject,
      status: "open",
      createdAt: new Date().toISOString(),
      messages: [{ author: "You", role: "buyer", text: subject, date: new Date().toISOString() }],
    };
    state = { ...state, tickets: [t, ...state.tickets] };
    emit();
    return t;
  },

  applyForStore(input: {
    userId: string;
    name: string;
    email: string;
    storeName: string;
    platformFocus: string;
    experience: string;
    reason: string;
  }): SellerApplication {
    const existing = state.sellerApplications.find(
      (a) => a.userId === input.userId && a.status === "pending",
    );
    if (existing) return existing;
    const application: SellerApplication = {
      ...input,
      id: `sa-${Math.random().toString(36).slice(2, 6)}`,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    state = { ...state, sellerApplications: [application, ...state.sellerApplications] };
    emit();
    return application;
  },

  setApplicationStatus(applicationId: string, status: SellerApplicationStatus): void {
    state = {
      ...state,
      sellerApplications: state.sellerApplications.map((a) =>
        a.id === applicationId ? { ...a, status } : a,
      ),
    };
    emit();
  },

  markNotificationsRead(userId: string): void {
    state = {
      ...state,
      notifications: state.notifications.map((n) =>
        n.userId === userId ? { ...n, read: true } : n,
      ),
    };
    emit();
  },
};

/* -------------------------------- selectors -------------------------------- */

export function getSeller(id: string): Seller {
  return sellers.find((s) => s.id === id) ?? sellers[0];
}

export function getCategory(slug: string): Category {
  return categories.find((c) => c.slug === slug) ?? categories[0];
}

export function getReviewsFor(listingId: string): Review[] {
  return reviews.filter((r) => r.listingId === listingId);
}

export function getRelated(listing: Listing, limit = 4): Listing[] {
  return state.listings
    .filter((l) => l.id !== listing.id && l.status === "active")
    .sort((a, b) => {
      const sameA = a.category === listing.category ? 0 : 1;
      const sameB = b.category === listing.category ? 0 : 1;
      return sameA - sameB || Math.abs(a.price - listing.price) - Math.abs(b.price - listing.price);
    })
    .slice(0, limit);
}

export { categories, sellers, reviews, auditLog };
