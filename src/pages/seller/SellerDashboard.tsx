import { useQuery } from "convex/react";
import { Link } from "react-router";
import { ArrowRight, Eye, Receipt, Wallet, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { sellerNav } from "@/components/dash/navs";
import { SectionHeading, StatCard, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { api as convexApi } from "@/convex/_generated/api";

export default function SellerDashboard() {
  // All three figures come from the signed-in seller's own server rows.
  const orders = useQuery(convexApi.marketplace.salesOrders);
  const listings = useQuery(convexApi.marketplace.sellerListings);
  const summary = useQuery(convexApi.marketplace.earningsSummary);

  const escrowHeld = (orders ?? [])
    .filter((o) => ["in_escrow", "transferring"].includes(o.status))
    .reduce((s, o) => s + o.grossAmount, 0);
  const activeListings = (listings ?? []).filter((l) => l.status === "active").length;
  const loading = orders === undefined || listings === undefined;

  return (
    <DashLayout title="Seller overview" nav={sellerNav}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Seller dashboard</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Manage listings, track sales and request payouts.
            </p>
          </div>
          <Button className="rounded-xl" asChild>
            <Link to="/seller/listings?new=1">
              <Tag className="size-4" />
              Create listing
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            value={summary ? formatPrice(summary.netUsd) : "—"}
            icon={Wallet}
            hint="After the 10% platform commission"
          />
          <StatCard
            label="Orders"
            value={loading ? "—" : String(orders?.length ?? 0)}
            icon={Receipt}
          />
        </div>

        <section className="glass p-6">
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
          ) : (orders ?? []).length === 0 ? (
            <p className="mt-4 py-6 text-center text-sm text-muted-foreground">
              No orders yet — publish a listing to get started.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {(orders ?? []).slice(0, 4).map((order) => (
                <li key={order._id} className="flex items-center gap-3 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {order.listingTitle}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {order.orderNo} ·{" "}
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  <StatusBadge status={order.status} />
                  <span className="w-20 text-right text-sm font-semibold tabular-nums">
                    {formatPrice(order.grossAmount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashLayout>
  );
}
