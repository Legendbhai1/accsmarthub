import {
  AlertCircle,
  BarChart3,
  Bell,
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
  { label: "Dashboard", to: "/seller", icon: LayoutDashboard },
  { label: "My Listings", to: "/seller/listings", icon: ShoppingBag },
  // `?new=1` opens the listing editor directly — the editor already reads
  // this param, so the button is a shortcut rather than a separate page.
  { label: "Create Listing", to: "/seller/listings?new=1", icon: PlusCircle },
  { label: "Orders", to: "/seller/orders", icon: Receipt },
  { label: "Transactions", to: "/seller/transactions", icon: Wallet },
  { label: "Analytics", to: "/seller/analytics", icon: BarChart3 },
  { label: "Disputes", to: "/seller/disputes", icon: AlertCircle },
  { label: "Support Chat", to: "/account/support", icon: MessageSquare },
  { label: "Earnings", to: "/seller/earnings", icon: Wallet },
  { label: "Store Settings", to: "/seller/settings", icon: Settings },
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
