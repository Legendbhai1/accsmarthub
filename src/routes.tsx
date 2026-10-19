import { Outlet, redirect, type RouteObject } from "react-router";
import { RequireRole } from "@/components/site/guards";
import { PublicLayout } from "@/components/site/PublicLayout";
import { motion } from "framer-motion";

// Buyer
import BuyerDashboard from "@/pages/buyer/BuyerDashboard";
import BuyerOrders from "@/pages/buyer/BuyerOrders";
import BuyerPurchased from "@/pages/buyer/BuyerPurchased";
import BuyerSaved from "@/pages/buyer/BuyerSaved";
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
import ErrorPage from "@/pages/ErrorPage";

const PageWrapper = () => (
  <motion.div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
    <Outlet />
  </motion.div>
);

/**
 * Section wrappers.
 *
 * These render `<Outlet/>`, so the route's own `element` stays a bare layout
 * and the matched child route fills it in. Passing the index page in as
 * `children` would shadow the outlet and make every sub-page render the index
 * dashboard while the URL said something else.
 */
function BuyerLayout() {
  return (
    <RequireRole roles={["buyer", "seller", "admin"]}>
      <PageWrapper />
    </RequireRole>
  );
}

function SellerLayout() {
  return (
    <RequireRole roles={["buyer", "seller", "admin"]}>
      <PageWrapper />
    </RequireRole>
  );
}

function AdminLayout() {
  return (
    <RequireRole roles={["admin"]}>
      <PageWrapper />
    </RequireRole>
  );
}

export const routes: RouteObject[] = [
  {
    // Pathless root. It exists only to host the error boundary, so an error
    // thrown by any route below renders the friendly error page instead of
    // React Router's built-in screen with a raw stack trace. Child paths stay
    // absolute because this route contributes no path segment of its own.
    errorElement: <ErrorPage />,
    children: [
      // --------------------------------------------------------------------
      // Public marketplace. Everything under here renders `PublicLayout`,
      // which owns the header, the footer and the mobile bottom tab bar. The
      // dashboards below deliberately do not, so the public Home /
      // Marketplace / Categories / Account bar cannot appear inside a
      // workspace.
      // --------------------------------------------------------------------
      {
        element: <PublicLayout />,
        children: [
          { path: "/", element: <Home /> },
          { path: "/marketplace", element: <Marketplace /> },
          // Canonical category directory. `/categories` was linked from the
          // header, the footer and the mobile tab bar while only this path was
          // declared, so all three links 404'd. Both spellings work now;
          // `/marketplace/categories` stays canonical and the short one
          // redirects to it.
          { path: "/marketplace/categories", element: <Categories /> },
          {
            path: "/categories",
            loader: () => redirect("/marketplace/categories"),
          },
          { path: "/marketplace/:id", element: <ListingDetail /> },
          // Older links and bookmarks used /listing/:id. Keep them working by
          // redirecting to the canonical route.
          {
            path: "/listing/:id",
            loader: ({ params }) => redirect(`/marketplace/${params.id}`),
          },
          { path: "/faq", element: <Faq /> },
          { path: "/trust", element: <Trust /> },
          { path: "/disputes", element: <Disputes /> },
        ],
      },

      // --------------------------------------------------------------------
      // Transactional pages. These keep the public header for orientation but
      // not the bottom bar: checkout and the auth screens are focused tasks,
      // and a persistent tab bar there invites abandoning the flow mid-payment.
      // --------------------------------------------------------------------
      { path: "/checkout", element: <Checkout /> },
      { path: "/order/:orderId/confirmed", element: <OrderConfirmed /> },
      { path: "/auth", element: <SupabaseAuth /> },
      { path: "/auth/forgot", element: <ForgotPassword /> },
      { path: "/auth/reset", element: <ResetPassword /> },
      // Both of these were linked or generated but never declared, so they
      // landed on the 404 page. `/reset-password` is the more serious of the
      // two: ForgotPassword passes it as Supabase's `redirectTo`, so the link
      // in a real recovery email pointed at a route that did not exist.
      // Declaring them as redirects keeps existing links and any redirect
      // allowlist entry in the Supabase dashboard working unchanged.
      {
        path: "/forgot-password",
        loader: () => redirect("/auth/forgot"),
      },
      {
        path: "/reset-password",
        loader: () => redirect("/auth/reset"),
      },

      {
        path: "/account",
        element: <BuyerLayout />,
        children: [
          { index: true, element: <BuyerDashboard /> },
          { path: "orders", element: <BuyerOrders /> },
          { path: "orders/:orderId", element: <BuyerOrderDetail /> },
          { path: "purchased", element: <BuyerPurchased /> },
          { path: "saved", element: <BuyerSaved /> },
          { path: "notifications", element: <BuyerNotifications /> },
          { path: "support", element: <BuyerSupport /> },
          { path: "wallet", element: <BuyerWallet /> },
          { path: "profile", element: <BuyerProfile /> },
        ],
      },
      {
        path: "/seller",
        element: <SellerLayout />,
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
        element: <AdminLayout />,
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
    ],
  },
];
