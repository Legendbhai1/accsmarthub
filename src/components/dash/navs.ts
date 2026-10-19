import {
  AlertCircle,
  BarChart3,
  Bell,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Package,
  PlusCircle,
  Receipt,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  Tags,
  Ticket,
  User,
  Users,
  Wallet,
} from "lucide-react";

export type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Match only the exact path. Set on section roots (`/account`, `/seller`,
   * `/admin`) so the root entry does not stay highlighted on every sub-page.
   */
  end?: boolean;
};

/** A titled cluster of links. Sections keep the long seller/admin rails legible. */
export type NavSection = { title: string; items: NavItem[] };

/**
 * The workspace link offered at the *bottom* of every rail. Kept out of the
 * sections so each shell can place it beside the account block instead of
 * burying it in the page list.
 */
export type Workspace = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

/** `/account` — the buyer workspace. */
export const buyerNav: NavSection[] = [
  {
    title: "Shopping",
    items: [
      { label: "Overview", to: "/account", icon: ShoppingBag, end: true },
      { label: "Orders", to: "/account/orders", icon: Receipt },
      { label: "Purchased", to: "/account/purchased", icon: Package },
      { label: "Saved", to: "/account/saved", icon: Heart },
    ],
  },
  {
    title: "Money & help",
    items: [
      { label: "Wallet", to: "/account/wallet", icon: Wallet },
      { label: "Notifications", to: "/account/notifications", icon: Bell },
      { label: "Support", to: "/account/support", icon: LifeBuoy },
    ],
  },
  {
    title: "Account",
    items: [{ label: "Profile", to: "/account/profile", icon: User }],
  },
];

/**
 * `/seller` — Seller Studio. Grouped by the job the seller is doing, so the
 * rail stays scannable at eleven entries instead of reading as one long list.
 */
export const sellerNav: NavSection[] = [
  {
    title: "Studio",
    items: [
      { label: "Overview", to: "/seller", icon: LayoutDashboard, end: true },
      { label: "My listings", to: "/seller/listings", icon: ShoppingBag },
      // `?new=1` opens the editor directly; the editor already reads the param,
      // so this is a shortcut rather than a separate page.
      { label: "Create listing", to: "/seller/listings?new=1", icon: PlusCircle },
    ],
  },
  {
    title: "Fulfilment",
    items: [
      { label: "Orders", to: "/seller/orders", icon: Receipt },
      { label: "Disputes", to: "/seller/disputes", icon: AlertCircle },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Earnings", to: "/seller/earnings", icon: Wallet },
      { label: "Transactions", to: "/seller/transactions", icon: Receipt },
      { label: "Analytics", to: "/seller/analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "Store settings", to: "/seller/settings", icon: Settings },
      { label: "Profile", to: "/seller/profile", icon: User },
    ],
  },
];

/** `/admin` — moderation and investigation. */
export const adminNav: NavSection[] = [
  {
    title: "Operations",
    items: [
      { label: "Overview", to: "/admin", icon: LayoutDashboard, end: true },
      { label: "Disputes", to: "/admin/disputes", icon: Shield },
      { label: "Reports", to: "/admin/reports", icon: Ticket },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { label: "Listings", to: "/admin/listings", icon: Tags },
      { label: "Categories", to: "/admin/categories", icon: Tags },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Users", to: "/admin/users", icon: Users },
      { label: "Sellers", to: "/admin/sellers", icon: Store },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Orders", to: "/admin/orders", icon: Receipt },
      { label: "Payments", to: "/admin/payments", icon: Wallet },
      { label: "Audit log", to: "/admin/audit", icon: Ticket },
    ],
  },
  {
    title: "System",
    items: [{ label: "Settings", to: "/admin/settings", icon: Settings }],
  },
];

/** Flattens a section list — handy for active-route lookups and tests. */
export function flatNav(sections: NavSection[]): NavItem[] {
  return sections.flatMap((section) => section.items);
}

/**
 * The workspace switcher. Only links the signed-in role can actually open are
 * offered, so a buyer is never sent to a page the guard will bounce them off.
 */
export function workspaceLinks(role: "buyer" | "seller" | "admin"): Workspace[] {
  const links: Workspace[] = [
    { label: "Seller studio", to: "/seller", icon: Store },
    { label: "Buyer account", to: "/account", icon: ShoppingBag },
    { label: "Support chat", to: "/account/support", icon: MessageSquare },
  ];
  if (role === "admin") {
    return [{ label: "Admin console", to: "/admin", icon: Shield }, ...links];
  }
  return links;
}
