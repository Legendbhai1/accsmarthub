import { Link } from "react-router";
import { ArrowRight, Eye, Receipt, ShoppingBag, Wallet, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeading, StatCard, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useMyOrders, useSellerListings, useEarningsSummary } from "@/lib/supabaseQueries";

export default function SellerDashboard() {
  // All three figures come from the signed-in seller's own Supabase rows.
  const ordersQuery = useMyOrders("seller");
  const listingsQuery = useSellerListings();
  const summaryQuery = useEarningsSummary();

  const orders = ordersQuery.data ?? [];
  const escrowHeld = orders
    .filter((o) => ["in_escrow", "disputed"].includes(o.status))
    .reduce((s, o) => s + o.gross_amount, 0);
  const activeListings = (listingsQuery.data ?? []).filter(
    (l) => l.status === "active",
  ).length;
  const loading = ordersQuery.loading || listingsQuery.loading;

  return (
    <>
      <div className="seller-page">
        <div className="seller-page-head flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="seller-sub text-sm text-muted-foreground">
              Manage listings, track sales and request payouts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* The same affordance the buyer workspace offers to reach the
                studio, in the other direction: a seller is also a buyer, and
                the header switcher is easy to miss on a phone. */}
            <Button variant="outline" className="rounded-xl" asChild>
              <Link to="/account">
                <ShoppingBag className="size-4" />
                Switch to buyer
              </Link>
            </Button>
            <Button className="rounded-xl" asChild>
              <Link to="/seller/listings?new=1">
                <Tag className="size-4" />
                Create listing
              </Link>
            </Button>
          </div>
        </div>

        <div className="seller-stat-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active listings"
            value={loading ? "—" : String(activeListings)}
            icon={Eye}
          />
          <StatCard
            label="In escrow"
            value={loading ? "—" : formatPrice(Math.round(escrowHeld * 100) / 100)}
            icon={Receipt}
            hint="Releases on buyer confirmation"
          />
          <StatCard
            label="Earned (completed)"
            value={summaryQuery.data ? formatPrice(summaryQuery.data.netUsd) : "—"}
            icon={Wallet}
            hint="After the 10% platform commission"
          />
          <StatCard
            label="Orders"
            value={loading ? "—" : String(orders.length)}
            icon={Receipt}
          />
        </div>

        <section className="card">
          <SectionHeading
            title="Recent orders"
            action={
              <Button variant="ghost" size="sm" className="rounded-xl" asChild>
                <Link to="/seller/orders">
                  View all <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
          {loading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading your orders…</p>
          ) : orders.length === 0 ? (
            <p className="mt-4 py-6 text-center text-sm text-muted-foreground">
              No orders yet — publish a listing to get started.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {orders.slice(0, 4).map((order) => (
                <li
                  key={order.order_no}
                  className="seller-order-row flex items-center gap-3 rounded-lg py-3.5"
                >
                  <span className="seller-order-cell min-w-0 flex-1">
                    <span className="seller-order-title block truncate text-sm font-medium">
                      {order.listing_title}
                    </span>
                    <span className="seller-order-meta text-xs text-muted-foreground">
                      {order.order_no} · {new Date(order.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  <StatusBadge status={order.status} />
                  <span className="seller-order-amount w-20 text-right text-sm font-semibold tabular-nums">
                    {formatPrice(order.gross_amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
