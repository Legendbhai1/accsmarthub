import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { ConvexClientProvider } from "@/lib/convex";
import { SessionProvider } from "@/lib/session";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import { RequireRole } from "@/components/site/guards";
import { PageTransition } from "@/components/site/PageTransition";

// Lazy load route components for better code splitting
const SiteLayout = lazy(() => import("@/components/site/SiteLayout").then((m) => ({ default: m.SiteLayout })));
const Home = lazy(() => import("./pages/public/Home.tsx"));
const Marketplace = lazy(() => import("./pages/public/Marketplace.tsx"));
const ListingDetail = lazy(() => import("./pages/public/ListingDetail.tsx"));
const Trust = lazy(() => import("./pages/public/Trust.tsx"));
const Faq = lazy(() => import("./pages/public/Faq.tsx"));
const Categories = lazy(() => import("./pages/public/Categories.tsx"));
const Disputes = lazy(() => import("./pages/public/Disputes.tsx"));
const Auth = lazy(() => import("./pages/flow/Auth.tsx"));
const Checkout = lazy(() => import("./pages/flow/Checkout.tsx"));
const OrderConfirmed = lazy(() => import("./pages/flow/OrderConfirmed.tsx"));
const BuyerDashboard = lazy(() => import("./pages/buyer/BuyerDashboard.tsx"));
const BuyerOrders = lazy(() => import("./pages/buyer/BuyerOrders.tsx"));
const BuyerOrderDetail = lazy(() => import("./pages/buyer/BuyerOrderDetail.tsx"));
const BuyerPurchased = lazy(() => import("./pages/buyer/BuyerPurchased.tsx"));
const BuyerWallet = lazy(() => import("./pages/buyer/BuyerWallet.tsx"));
const BuyerNotifications = lazy(() => import("./pages/buyer/BuyerNotifications.tsx"));
const BuyerSupport = lazy(() => import("./pages/buyer/BuyerSupport.tsx"));
const BuyerProfile = lazy(() => import("./pages/buyer/BuyerProfile.tsx"));
const SellerApply = lazy(() => import("./pages/seller/SellerApply.tsx"));
const SellerDashboard = lazy(() => import("./pages/seller/SellerDashboard.tsx"));
const SellerListings = lazy(() => import("./pages/seller/SellerListings.tsx"));
const SellerOrders = lazy(() => import("./pages/seller/SellerOrders.tsx"));
const SellerEarnings = lazy(() => import("./pages/seller/SellerEarnings.tsx"));
const SellerDisputes = lazy(() => import("./pages/seller/SellerDisputes.tsx"));
const SellerProfile = lazy(() => import("./pages/seller/SellerProfile.tsx"));
const SellerTransactions = lazy(() => import("./pages/seller/SellerTransactions.tsx"));
const SellerAnalytics = lazy(() => import("./pages/seller/SellerAnalytics.tsx"));
const SellerSettings = lazy(() => import("./pages/seller/SellerSettings.tsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.tsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.tsx"));
const AdminSellers = lazy(() => import("./pages/admin/AdminSellers.tsx"));
const AdminListings = lazy(() => import("./pages/admin/AdminListings.tsx"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders.tsx"));
const AdminPayments = lazy(() => import("./pages/admin/AdminPayments.tsx"));
const AdminDisputes = lazy(() => import("./pages/admin/AdminDisputes.tsx"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories.tsx"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports.tsx"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit.tsx"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 break-words text-xs text-muted-foreground">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 max-h-40 overflow-auto rounded border border-border/60 p-2 text-left text-[10px] leading-4 text-muted-foreground/80">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexClientProvider>
        <SessionProvider>
          <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <PageTransition>
            <Routes>
              {/* Public site */}
              <Route element={<SiteLayout />}>
                <Route path="/" element={<Home />} />
                
                <Route path="/listing/:id" element={<ListingDetail />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/disputes" element={<Disputes />} />
                <Route path="/trust" element={<Trust />} />
                <Route path="/faq" element={<Faq />} />
              </Route>

              {/* Marketplace renders its own mobile app shell */}
              <Route path="/marketplace" element={<Marketplace />} />

              {/* Auth & purchase flow */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order/:orderId/confirmed" element={<OrderConfirmed />} />

              {/* Buyer account */}
              <Route path="/account" element={<RequireRole roles={["buyer", "seller", "admin"]}><BuyerDashboard /></RequireRole>} />
              <Route path="/account/orders" element={<RequireRole roles={["buyer", "seller", "admin"]}><BuyerOrders /></RequireRole>} />
              <Route path="/account/orders/:orderId" element={<RequireRole roles={["buyer", "seller", "admin"]}><BuyerOrderDetail /></RequireRole>} />
              <Route path="/account/purchased" element={<RequireRole roles={["buyer", "seller", "admin"]}><BuyerPurchased /></RequireRole>} />
              <Route path="/account/wallet" element={<RequireRole roles={["buyer", "seller", "admin"]}><BuyerWallet /></RequireRole>} />
              <Route path="/account/notifications" element={<RequireRole roles={["buyer", "seller", "admin"]}><BuyerNotifications /></RequireRole>} />
              <Route path="/account/support" element={<RequireRole roles={["buyer", "seller", "admin"]}><BuyerSupport /></RequireRole>} />
              <Route path="/account/profile" element={<RequireRole roles={["buyer", "seller", "admin"]}><BuyerProfile /></RequireRole>} />

              {/* Seller area */}
              <Route path="/seller/apply" element={<RequireRole roles={["buyer", "seller", "admin"]}><SellerApply /></RequireRole>} />
              <Route path="/seller" element={<RequireRole roles={["seller", "admin"]}><SellerDashboard /></RequireRole>} />
              <Route path="/seller/listings" element={<RequireRole roles={["seller", "admin"]}><SellerListings /></RequireRole>} />
              <Route path="/seller/orders" element={<RequireRole roles={["seller", "admin"]}><SellerOrders /></RequireRole>} />
              <Route path="/seller/earnings" element={<RequireRole roles={["seller", "admin"]}><SellerEarnings /></RequireRole>} />
              <Route path="/seller/disputes" element={<RequireRole roles={["seller", "admin"]}><SellerDisputes /></RequireRole>} />
              <Route path="/seller/transactions" element={<RequireRole roles={["seller", "admin"]}><SellerTransactions /></RequireRole>} />
              <Route path="/seller/analytics" element={<RequireRole roles={["seller", "admin"]}><SellerAnalytics /></RequireRole>} />
              <Route path="/seller/settings" element={<RequireRole roles={["seller", "admin"]}><SellerSettings /></RequireRole>} />
              <Route path="/seller/profile" element={<RequireRole roles={["seller", "admin"]}><SellerProfile /></RequireRole>} />

              {/* Admin panel */}
              <Route path="/admin" element={<RequireRole roles={["admin"]}><AdminDashboard /></RequireRole>} />
              <Route path="/admin/users" element={<RequireRole roles={["admin"]}><AdminUsers /></RequireRole>} />
              <Route path="/admin/sellers" element={<RequireRole roles={["admin"]}><AdminSellers /></RequireRole>} />
              <Route path="/admin/listings" element={<RequireRole roles={["admin"]}><AdminListings /></RequireRole>} />
              <Route path="/admin/orders" element={<RequireRole roles={["admin"]}><AdminOrders /></RequireRole>} />
              <Route path="/admin/payments" element={<RequireRole roles={["admin"]}><AdminPayments /></RequireRole>} />
              <Route path="/admin/disputes" element={<RequireRole roles={["admin"]}><AdminDisputes /></RequireRole>} />
              <Route path="/admin/categories" element={<RequireRole roles={["admin"]}><AdminCategories /></RequireRole>} />
              <Route path="/admin/reports" element={<RequireRole roles={["admin"]}><AdminReports /></RequireRole>} />
              <Route path="/admin/audit" element={<RequireRole roles={["admin"]}><AdminAudit /></RequireRole>} />
              <Route path="/admin/settings" element={<RequireRole roles={["admin"]}><AdminSettings /></RequireRole>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            </PageTransition>
          </Suspense>
        </BrowserRouter>
        </SessionProvider>
      </ConvexClientProvider>
      <Toaster />
    </RootErrorBoundary>
  </StrictMode>,
);
