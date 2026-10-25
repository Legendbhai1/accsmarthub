import { Users, Store, Package, Receipt, AlertTriangle, Wallet, BarChart3, Settings, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { disputeReasonLabel } from "@/lib/disputeReasons";
import { usePlatformStats } from "@/lib/supabaseQueries";
import { useAdminDisputes } from "@/lib/supabaseQueries";

const cards = [
  {
    label: "Gross volume",
    key: "grossVolumeUsd" as const,
    icon: BarChart3,
    money: true,
  },
  {
    label: "Commission",
    key: "commissionUsd" as const,
    icon: Receipt,
    money: true,
  },
  {
    label: "Escrow held",
    key: "escrowHeldUsd" as const,
    icon: Wallet,
    money: true,
  },
  {
    label: "Users",
    key: "userCount" as const,
    icon: Users,
    money: false,
  },
  {
    label: "Approved stores",
    key: "approvedStoreCount" as const,
    icon: Store,
    money: false,
  },
  {
    label: "Active listings",
    key: "activeListingCount" as const,
    icon: Package,
    money: false,
  },
  {
    label: "Open reports",
    key: "openReportCount" as const,
    icon: AlertTriangle,
    money: false,
  },
  {
    label: "Open disputes",
    key: "openDisputeCount" as const,
    icon: AlertTriangle,
    money: false,
  },
];

export default function AdminDashboard() {
  const statsQuery = usePlatformStats();
  const disputesQuery = useAdminDisputes();
  const stats = statsQuery.data;
  const disputes = disputesQuery.data ?? [];

  return (
    <>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Trust & safety controls for the platform. Volume, settlements, moderation, and
          open cases all feed into the same operational view.
        </p>

        {stats ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map(({ label, key, icon: Icon, money }) => (
              <div
                key={label}
                className="rounded-2xl border border-border/70 bg-card p-5 text-card-foreground shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
                      {money ? formatPrice(stats[key]) : stats[key].toLocaleString()}
                    </p>
                  </div>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4.5" />
                  </div>
                </div>
                {key === "userCount" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Accounts on the platform, confirmed or not.
                  </p>
                )}
                {key === "openReportCount" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Off-platform contact and policy reports awaiting review.
                  </p>
                )}
                {key === "openDisputeCount" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Disputes still awaiting an admin decision.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="surface overflow-hidden">
            <EmptyState
              title="No metrics yet"
              description="Platform figures appear here once orders, users, and stores are in the system."
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Open issues</h2>
          <Link
            to="/admin/disputes"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            View all
          </Link>
        </div>

        {disputes.length === 0 ? (
          <div className="surface overflow-hidden">
            <EmptyState
              title="Nothing pending"
              description="No disputes are waiting for attention right now."
              action={
                <Button variant="outline" className="rounded-xl" asChild>
                  <Link to="/admin/disputes">Open dispute inbox</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <div className="surface overflow-hidden">
            <div className="border-border/70 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </div>
            <ul className="divide-y divide-border/60">
              {disputes.slice(0, 5).map((d) => (
                <li
                  key={d.id}
                  className="px-5 py-4 transition-colors hover:bg-accent/30"
                >
                  <Link
                    to={`/admin/disputes`}
                    className="block"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {disputeReasonLabel(d.reason)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {d.order_no} · {d.listing_title}
                        </span>
                      </span>
                      <Badge variant="outline" className="rounded-lg border-border/70 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {d.status.replace("_", " ")}
                      </Badge>
                      <span className="w-20 text-right text-xs text-muted-foreground">
                        {new Date(d.created_at).toLocaleDateString()}
                      </span>
                      <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/admin/orders">
              <Receipt className="size-4 mr-2" />
              Orders
            </Link>
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/admin/sellers">
              <Store className="size-4 mr-2" />
              Sellers
            </Link>
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/admin/listings">
              <Package className="size-4 mr-2" />
              Listings
            </Link>
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/admin/reports">
              <AlertTriangle className="size-4 mr-2" />
              Reports
            </Link>
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/admin/settings">
              <Settings className="size-4 mr-2" />
              Settings
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
