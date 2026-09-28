import {
  Bell,
  LifeBuoy,
  Package,
  Receipt,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  Tags,
  Ticket,
  User,
  Wallet,
} from "lucide-react";
import type { NavItem } from "@/components/dash/DashLayout";

export const buyerNav: NavItem[] = [
  { label: "Overview", to: "/account", icon: ShoppingBag },
  { label: "Orders", to: "/account/orders", icon: Receipt },
  { label: "Purchased", to: "/account/purchased", icon: Package },
  { label: "Wallet", to: "/account/wallet", icon: Wallet },
  { label: "Notifications", to: "/account/notifications", icon: Bell },
  { label: "Support", to: "/account/support", icon: LifeBuoy },
  { label: "Profile", to: "/account/profile", icon: User },
];

export const sellerNav: NavItem[] = [
  { label: "Overview", to: "/seller", icon: Store },
  { label: "Listings", to: "/seller/listings", icon: Tags },
  { label: "Orders", to: "/seller/orders", icon: Receipt },
  { label: "Earnings", to: "/seller/earnings", icon: Wallet },
  { label: "Disputes", to: "/seller/disputes", icon: Shield },
  { label: "Profile", to: "/seller/profile", icon: User },
];

export const adminNav: NavItem[] = [
  { label: "Overview", to: "/admin", icon: Store },
  { label: "Users", to: "/admin/users", icon: User },
  { label: "Sellers", to: "/admin/sellers", icon: Store },
  { label: "Listings", to: "/admin/listings", icon: Tags },
  { label: "Orders", to: "/admin/orders", icon: Receipt },
  { label: "Payments", to: "/admin/payments", icon: Wallet },
  { label: "Disputes", to: "/admin/disputes", icon: Shield },
  { label: "Categories", to: "/admin/categories", icon: Tags },
  { label: "Reports", to: "/admin/reports", icon: Ticket },
  { label: "Audit log", to: "/admin/audit", icon: Ticket },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];
