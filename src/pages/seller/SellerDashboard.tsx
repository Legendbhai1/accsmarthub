import { Link } from "react-router";
import { ArrowRight, Eye, Receipt, Wallet, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { sellerNav } from "@/components/dash/navs";
import { SectionHeading, StatCard, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useDb } from "@/lib/db";

/** Demo: the signed-in seller is mapped to the seeded "Meridian Digital" account. */
export const DEMO_SELLER_ID = "s-1";

export default function SellerDashboard() {
  const { listings, orders } = useDb();
  const myListings = listings.filter((l) => l.sellerId === DEMO_SELLER_ID);
  const myOrders = orders.filter((o) => o.sellerId === DEMO_SELLER_ID);
  const escrow = myOrders
    .filter((o) => o.status === "in_escrow" || o.status === "transferring")
    .reduce((s, o) => s + o.total, 0);
  const earned = myOrders
    .filter((o) => o.status === "completed")
    .reduce((s, o) => s + o.total, 0);

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
          <StatCard label="Active listings" value={String(myListings.filter((l) => l.status === "active").length)} icon={Eye} />
          <StatCard label="Escrow pending" value={formatPrice(escrow)} icon={Receipt} hint="Releases on buyer confirmation" />
          <StatCard label="Earned (completed)" value={formatPrice(Math.round(earned * 0.92))} icon={Wallet} hint="After 8% fee" />
          <StatCard label="Orders" value={String(myOrders.length)} icon={Receipt} />
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
          <ul className="mt-4 divide-y divide-border/60">
            {myOrders.slice(0, 4).map((order) => (
              <li key={order.id} className="flex items-center gap-3 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{order.listingTitle}</span>
                  <span className="text-xs text-muted-foreground">
                    #{order.id} · {new Date(order.createdAt).toLocaleDateString()}
                  </span>
                </span>
                <StatusBadge status={order.status} />
                <span className="w-20 text-right text-sm font-semibold tabular-nums">
                  {formatPrice(order.total)}
                </span>
              </li>
            ))}
            {myOrders.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                No orders yet — publish a listing to get started.
              </li>
            )}
          </ul>
        </section>
      </div>
    </DashLayout>
  );
}
