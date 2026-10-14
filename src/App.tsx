import { createBrowserRouter, Navigate } from "react-router";
import { RequireRole } from "@/components/site/guards";
import { SessionProvider } from "@/lib/session";
import { motion } from "framer-motion";

// Buyer
import BuyerDashboard from "@/pages/buyer/BuyerDashboard";
import BuyerOrders from "@/pages/buyer/BuyerOrders";
import BuyerPurchased from "@/pages/buyer/BuyerPurchased";
import BuyerNotifications from "@/pages/buyer/BuyerNotifications";
import BuyerSupport from "@/pages/buyer/BuyerSupport";
import BuyerWallet from "@/pages/buyer/BuyerWallet";
import BuyerOrderDetail from "@/pages/buyer/BuyerOrderDetail";
import BuyerProfile from "@/pages/buyer/BuyerProfile";

// Seller
import SellerDashboard from "@/pages/seller/SellerDashboard";
import SellerListings from "@/pages/seller/SellerListings";
import SellerOrders from "@/pages/seller/SellerOrders";
import SellerDisputes from "@/pages/seller/SellerDisputes";
import SellerEarnings from "@/pages/seller/SellerEarnings";
import SellerSettings from "@/pages/seller/SellerSettings";
import SellerApply from "@/pages/seller/SellerApply";
import SellerProfile from "@/pages/seller/SellerProfile";
import SellerAnalytics from "@/pages/seller/SellerAnalytics";
import SellerTransactions from "@/pages/seller/SellerTransactions";

// Admin
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminSellers from "@/pages/admin/AdminSellers";
import AdminListings from "@/pages/admin/AdminListings";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminPayments from "@/pages/admin/AdminPayments";
import AdminDisputes from "@/pages/admin/AdminDisputes";
import AdminCategories from "@/pages/admin/AdminCategories";
import AdminReports from "@/pages/admin/AdminReports";
import AdminAudit from "@/pages/admin/AdminAudit";
import AdminSettings from "@/pages/admin/AdminSettings";

// Public
import Home from "@/pages/public/Home";
import Marketplace from "@/pages/public/Marketplace";
import ListingDetail from "@/pages/public/ListingDetail";
import Categories from "@/pages/public/Categories";
import Faq from "@/pages/public/Faq";
import Trust from "@/pages/public/Trust";
import Disputes from "@/pages/public/Disputes";

// Flow
import Checkout from "@/pages/flow/Checkout";
import OrderConfirmed from "@/pages/flow/OrderConfirmed";
import SupabaseAuth from "@/pages/flow/SupabaseAuth";
import ForgotPassword from "@/pages/flow/ForgotPassword";
import ResetPassword from "@/pages/flow/ResetPassword";

import NotFound from "@/pages/NotFound";

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    className="animate-in fade-in slide-in-from-bottom-4 duration-300"
  >
    {children}
  </motion.div>
);

const buyerLayout = ({ children }: { children: React.ReactNode }) => (
  <RequireRole roles={["buyer", "seller", "admin"]}>
    <PageWrapper>{children}</PageWrapper>
  </RequireRole>
);

const sellerLayout = ({ children }: { children: React.ReactNode }) => (
  <RequireRole roles={["buyer", "seller", "admin"]}>
    <PageWrapper>{children}</PageWrapper>
  </RequireRole>
);

const adminLayout = ({ children }: { children: React.ReactNode }) => (
  <RequireRole roles={["admin"]}>
    <PageWrapper>{children}</PageWrapper>
  </RequireRole>
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/marketplace",
    element: <Marketplace />,
  },
  {
    path: "/marketplace/categories",
    element: <Categories />,
  },
  {
    path: "/marketplace/:id",
    element: <ListingDetail />,
  },
  {
    path: "/faq",
    element: <Faq />,
  },
  {
    path: "/trust",
    element: <Trust />,
  },
  {
    path: "/disputes",
    element: <Disputes />,
  },
  {
    path: "/checkout",
    element: <Checkout />,
  },
  {
    path: "/order/:orderId/confirmed",
    element: <OrderConfirmed />,
  },
  {
    path: "/auth",
    element: <SupabaseAuth />,
  },
  {
    path: "/auth/forgot",
    element: <ForgotPassword />,
  },
  {
    path: "/auth/reset",
    element: <ResetPassword />,
  },
  {
    path: "/account",
    element: < buyerLayout><BuyerDashboard /></buyerLayout>,
    children: [
      { index: true, element: <BuyerDashboard /> },
      { path: "orders", element: <BuyerOrders /> },
      { path: "orders/:orderId", element: <BuyerOrderDetail /> },
      { path: "purchased", element: <BuyerPurchased /> },
      { path: "notifications", element: <BuyerNotifications /> },
      { path: "support", element: <BuyerSupport /> },
      { path: "wallet", element: <BuyerWallet /> },
      { path: "profile", element: <BuyerProfile /> },
    ],
  },
  {
    path: "/seller",
    element: < sellerLayout><SellerDashboard /></sellerLayout>,
    children: [
      { index: true, element: <SellerDashboard /> },
      { path: "listings", element: <SellerListings /> },
      { path: "orders", element: <SellerOrders /> },
      { path: "disputes", element: <SellerDisputes /> },
      { path: "earnings", element: <SellerEarnings /> },
      { path: "settings", element: <SellerSettings /> },
      { path: "apply", element: <SellerApply /> },
      { path: "profile", element: <SellerProfile /> },
      { path: "analytics", element: <SellerAnalytics /> },
      { path: "transactions", element: <SellerTransactions /> },
    ],
  },
  {
    path: "/admin",
    element: < adminLayout><AdminDashboard /></adminLayout>,
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: "users", element: <AdminUsers /> },
      { path: "sellers", element: <AdminSellers /> },
      { path: "listings", element: <AdminListings /> },
      { path: "orders", element: <AdminOrders /> },
      { path: "payments", element: <AdminPayments /> },
      { path: "disputes", element: <AdminDisputes /> },
      { path: "categories", element: <AdminCategories /> },
      { path: "reports", element: <AdminReports /> },
      { path: "audit", element: <AdminAudit /> },
      { path: "settings", element: <AdminSettings /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

export default router;
