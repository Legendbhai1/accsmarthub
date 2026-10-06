import { Link } from "react-router";
import {
  ArrowRight,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Eye,
  Receipt,
  ShieldAlert,
  Store,
  Tags,
  Timer,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState, StatCard, SectionHeading, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { usePlatformStats, useAllOrders } from "@/lib/supabaseQueries";

export default function AdminDashboard() {
  const statsQuery = usePlatformStats();
  const ordersQuery = useAllOrders();

  const stats = statsQuery.data;
  const loading = statsQuery.loading || ordersQuery.loading;
  const latest = (ordersQuery.data ?? []).slice(0, 6);
  const pendingOrders = (ordersQuery.data ?? []).filter(o => o.status === "in_escrow").length;
  const disputedOrders = (ordersQuery.data ?? []).filter(o => o.status === "disputed").length;

  const needsAttention = (stats?.openReportCount ?? 0) + (stats?.openDisputeCount ?? 0) + (stats?.pendingStoreCount ?? 0);

  return (
    <DashLayout title="Admin overview" nav={adminNav}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Platform overview
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Live statistics from orders, listings, wallets and stores.
            </p>
          </div>
          {needsAttention > 0 && (
            <Button className="rounded-xl" asChild>
              <Link to="/admin/reports">
                <AlertTriangle className="size-4" />
                {needsAttention} item{needsAttention !== 1 ? "s" : ""} need attention
              </Link>
            </Button>
          )}
        </div>

        {/* Primary metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Gross order volume"
            value={loading ? "—" : formatPrice(stats?.grossVolumeUsd ?? 0)}
            icon={DollarSign}
            hint={loading ? undefined : `Commission ${formatPrice(stats?.commissionUsd ?? 0)}`}
          />
          <StatCard
            label="Held in escrow"
            value={loading ? "—" : formatPrice(stats?.escrowHeldUsd ?? 0)}
            icon={Wallet}
            hint="Buyer funds awaiting confirmation"
          />
          <StatCard
            label="Total accounts"
            value={loading ? "—" : String(stats?.userCount ?? 0)}
            icon={Users}
            hint={loading ? undefined : `${stats?.approvedStoreCount ?? 0} approved sellers`}
          />
          <StatCard
            label="Needs attention"
            value={loading ? "—" : String(needsAttention)}
            icon={AlertTriangle}
            hint={
              loading
                ? undefined
                : `${stats?.openReportCount ?? 0} reports · ${stats?.openDisputeCount ?? 0} disputes · ${stats?.pendingStoreCount ?? 0} stores`
            }
          />
        </div>

        {/* Secondary metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active listings"
            value={loading ? "—" : String(stats?.activeListingCount ?? 0)}
            icon={Store}
          />
          <StatCard
            label="Pending review"
            value={loading ? "—" : String(stats?.pendingListingCount ?? 0)}
            icon={ClipboardList}
          />
          <StatCard
            label="Stores awaiting approval"
            value={loading ? "—" : String(stats?.pendingStoreCount ?? 0)}
            icon={Tags}
          />
          <StatCard
            label="Orders completed"
            value={loading ? "—" : String(stats?.completedCount ?? 0)}
            icon={CheckCircle2}
          />
        </div>

        {/* Quick actions */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="size-4 text-primary" />
                Quick actions
              </CardTitle>
              <CardDescription>Common admin tasks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                <Button variant="outline" className="rounded-lg justify-start" asChild>
                  <Link to="/admin/sellers">
                    <Tags className="size-4" />
                    Review {stats?.pendingStoreCount ? `${stats.pendingStoreCount} store${stats.pendingStoreCount !== 1 ? "s" : ""}` : "store applications"}
                  </Link>
                </Button>
                <Button variant="outline" className="rounded-lg justify-start" asChild>
                  <Link to="/admin/listings">
                    <Eye className="size-4" />
                    Review {stats?.pendingListingCount ? `${stats.pendingListingCount} listing${stats.pendingListingCount !== 1 ? "s" : ""}` : "listings"}
                  </Link>
                </Button>
                <Button variant="outline" className="rounded-lg justify-start" asChild>
                  <Link to="/admin/disputes">
                    <AlertTriangle className="size-4" />
                    Handle {disputedOrders ? `${disputedOrders} dispute${disputedOrders !== 1 ? "s" : ""}` : "disputes"}
                  </Link>
                </Button>
                <Button variant="outline" className="rounded-lg justify-start" asChild>
                  <Link to="/admin/reports">
                    <ShieldAlert className="size-4" />
                    Review {stats?.openReportCount ? `${stats.openReportCount} report${stats.openReportCount !== 1 ? "s" : ""}` : "reports"}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Tabs: Orders / Insights */}
        <Tabs defaultValue="orders" className="space-y-4">
          <TabsList className="rounded-xl border-border/60 justify-start">
            <TabsTrigger value="orders" className="rounded-lg">Latest orders</TabsTrigger>
            <TabsTrigger value="insights" className="rounded-lg">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-4">
            <section className="glass p-6 sm:p-7">
              <SectionHeading
                title="Recent orders"
                subtitle="Escrow-protected purchases across the platform."
                action={
                  <Button variant="ghost" size="sm" className="rounded-xl" asChild>
                    <Link to="/admin/orders">
                      View all <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                }
              />
              {loading ? (
                <p className="mt-4 text-sm text-muted-foreground">Loading orders…</p>
              ) : latest.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="No orders yet"
                    description="Orders appear here as soon as the first escrow-protected purchase is placed."
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {latest.map((order) => (
                    <div key={order.order_no} className="flex items-center gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{order.listing_title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {order.order_no} · {new Date(order.created_at).toLocaleDateString()} · {order.buyer_id} → {order.seller_id}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">{formatPrice(order.total_usd)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatPrice(order.gross_amount)} gross · {formatPrice(order.commission_amount)} commission
                          </p>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Platform health */}
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="size-4" />
                    Platform health
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Dispute rate</span>
                      <span className="text-sm font-medium">
                        {loading ? "—" : ((stats?.openDisputeCount ?? 0) > 0 ? "Elevated" : "Normal")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Escrow held</span>
                      <span className="text-sm font-medium">
                        {loading ? "—" : formatPrice(stats?.escrowHeldUsd ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Pending stores</span>
                      <span className="text-sm font-medium">
                        {loading ? "—" : `${stats?.pendingStoreCount ?? 0} awaiting review`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Open reports</span>
                      <span className="text-sm font-medium">
                        {loading ? "—" : `${stats?.openReportCount ?? 0} pending`}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Top insights */}
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="size-4" />
                    What needs your attention
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {stats?.pendingStoreCount ? (
                      <li className="flex items-center gap-2 text-sm">
                        <Timer className="size-4 text-amber-500" />
                        <span className="text-muted-foreground">{stats.pendingStoreCount} store applications waiting for review</span>
                      </li>
                    ) : null}
                    {stats?.pendingListingCount ? (
                      <li className="flex items-center gap-2 text-sm">
                        <Timer className="size-4 text-amber-500" />
                        <span className="text-muted-foreground">{stats.pendingListingCount} listings pending approval</span>
                      </li>
                    ) : null}
                    {stats?.openReportCount ? (
                      <li className="flex items-center gap-2 text-sm">
                        <ShieldAlert className="size-4 text-red-500" />
                        <span className="text-muted-foreground">{stats.openReportCount} off-platform contact reports open</span>
                      </li>
                    ) : null}
                    {stats?.openDisputeCount ? (
                      <li className="flex items-center gap-2 text-sm">
                        <AlertTriangle className="size-4 text-red-500" />
                        <span className="text-muted-foreground">{stats.openDisputeCount} disputes need resolution</span>
                      </li>
                    ) : null}
                    {!needsAttention && (
                      <li className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="size-4 text-green-500" />
                        Nothing needs attention right now
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashLayout>
  );
}
