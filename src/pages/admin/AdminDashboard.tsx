import { useQuery } from "convex/react";
import { Link } from "react-router";
import { ArrowRight, Receipt, ShieldAlert, Store, Tags, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState, StatCard, SectionHeading, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { api as convexApi } from "@/convex/_generated/api";

export default function AdminDashboard() {
  // Counted server-side from the real ledger. Zeros here mean the platform
  // genuinely has no activity yet.
  const stats = useQuery(convexApi.stats.platformStats);
  const orders = useQuery(convexApi.marketplace.allOrders);

  const loading = stats === undefined;
  const latest = (orders ?? []).slice(0, 5);

  return (
    <DashLayout title="Admin overview" nav={adminNav}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Platform statistics
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Counted live from orders, listings, wallets and stores.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Gross order volume"
            value={loading ? "—" : formatPrice(stats?.grossVolumeUsd ?? 0)}
            icon={Receipt}
            hint={
              loading
                ? undefined
                : `Commission ${formatPrice(stats?.commissionUsd ?? 0)}`
            }
          />
          <StatCard
            label="Held in escrow"
            value={loading ? "—" : formatPrice(stats?.escrowHeldUsd ?? 0)}
            icon={ShieldAlert}
            hint="Buyer funds awaiting confirmation"
          />
          <StatCard
            label="Accounts"
            value={loading ? "—" : String(stats?.userCount ?? 0)}
            icon={Users}
            hint={loading ? undefined : `${stats?.approvedStoreCount ?? 0} approved sellers`}
          />
          <StatCard
            label="Needs attention"
            value={loading ? "—" : String((stats?.openReportCount ?? 0) + (stats?.openDisputeCount ?? 0))}
            icon={ShieldAlert}
            hint={
              loading
                ? undefined
                : `${stats?.openReportCount ?? 0} reports · ${stats?.openDisputeCount ?? 0} disputes`
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active listings"
            value={loading ? "—" : String(stats?.activeListingCount ?? 0)}
            icon={Store}
          />
          <StatCard
            label="Listings pending review"
            value={loading ? "—" : String(stats?.pendingListingCount ?? 0)}
            icon={Tags}
          />
          <StatCard
            label="Stores pending approval"
            value={loading ? "—" : String(stats?.pendingStoreCount ?? 0)}
            icon={Store}
          />
          <StatCard
            label="Transfers completed"
            value={loading ? "—" : String(stats?.completedCount ?? 0)}
            icon={Receipt}
          />
        </div>

        <section className="glass p-6 sm:p-7">
          <SectionHeading
            title="Latest orders"
            action={
              <Button variant="ghost" size="sm" className="rounded-xl" asChild>
                <Link to="/admin/orders">
                  View all <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
          {loading || orders === undefined ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading orders…</p>
          ) : latest.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No orders yet"
                description="Orders appear here as soon as the first escrow-protected purchase is placed."
              />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {latest.map((order) => (
                <li key={order._id} className="flex items-center gap-3 py-3">
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
                    {formatPrice(order.totalUsd)}
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
