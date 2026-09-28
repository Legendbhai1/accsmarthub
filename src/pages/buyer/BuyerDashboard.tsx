import { Link } from "react-router";
import { ArrowRight, Package, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { EmptyState, SectionHeading, StatCard, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useDb } from "@/lib/db";
import { useSession } from "@/lib/session";

export default function BuyerDashboard() {
  const { user } = useSession();
  const { orders } = useDb();
  const mine = orders.filter((o) => o.buyerId === "u-me");
  const spent = mine
    .filter((o) => o.status !== "refunded")
    .reduce((sum, o) => sum + o.total, 0);
  const active = mine.filter((o) => ["in_escrow", "transferring", "pending"].includes(o.status));

  return (
    <DashLayout title="Buyer overview" nav={buyerNav}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Track your purchases, escrow status and transfers.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Active orders" value={String(active.length)} icon={Receipt} hint="In escrow or transferring" />
          <StatCard label="Lifetime purchases" value={formatPrice(spent)} icon={Package} />
          <StatCard label="Wallet balance" value={formatPrice(user?.balance ?? 0)} icon={Wallet} hint="Available for checkout" />
        </div>

        <section className="glass p-6">
          <SectionHeading
            title="Recent orders"
            action={
              <Button variant="ghost" size="sm" className="rounded-xl" asChild>
                <Link to="/account/orders">
                  View all <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
          {mine.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No orders yet"
                description="Browse the marketplace and complete your first escrow-protected purchase."
                action={
                  <Button className="rounded-xl" asChild>
                    <Link to="/marketplace">Browse marketplace</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {mine.slice(0, 4).map((order) => (
                <li key={order.id}>
                  <Link
                    to={`/account/orders/${order.id}`}
                    className="flex items-center gap-3 py-3.5 transition-colors hover:text-primary"
                  >
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
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashLayout>
  );
}
