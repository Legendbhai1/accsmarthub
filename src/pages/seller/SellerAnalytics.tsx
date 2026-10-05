import { useMemo } from "react";
import { BarChart3, TrendingUp, Users } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { sellerNav } from "@/components/dash/navs";
import { EmptyState, StatCard } from "@/components/common/Primitives";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { useMyOrders, useSellerListings } from "@/lib/supabaseQueries";

/**
 * Analytics — performance derived from the real order ledger.
 *
 * Every chart is computed from actual sales, so an empty platform shows an
 * honest empty state rather than a flattering sample graph.
 */
export default function SellerAnalytics() {
  const ordersQuery = useMyOrders("seller");
  const listingsQuery = useSellerListings();
  const loading = ordersQuery.loading || listingsQuery.loading;
  // Stable identity so the memos below are not invalidated on every render.
  const rows = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);

  const byListing = useMemo(() => {
    const map = new Map<
      string,
      { title: string; brand: string; units: number; gross: number; net: number }
    >();
    for (const o of rows) {
      const entry = map.get(o.listing_id) ?? {
        title: o.listing_title,
        brand: o.brand,
        units: 0,
        gross: 0,
        net: 0,
      };
      entry.units += o.quantity;
      entry.gross += o.gross_amount;
      entry.net += o.seller_net_amount;
      map.set(o.listing_id, entry);
    }
    return [...map.entries()]
      .map(([listingId, v]) => ({ listingId, ...v }))
      .sort((a, b) => b.gross - a.gross);
  }, [rows]);

  const byBrand = useMemo(() => {
    const map = new Map<string, { units: number; gross: number }>();
    for (const o of rows) {
      const entry = map.get(o.brand) ?? { units: 0, gross: 0 };
      entry.units += o.quantity;
      entry.gross += o.gross_amount;
      map.set(o.brand, entry);
    }
    return [...map.entries()]
      .map(([brand, v]) => ({ brand, ...v }))
      .sort((a, b) => b.gross - a.gross);
  }, [rows]);

  // Last 30 days as a simple bar series.
  const series = useMemo(() => {
    const days: { label: string; gross: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const from = day.getTime();
      const to = next.getTime();
      const gross = rows
        .filter((o) => {
          const t = new Date(o.created_at).getTime();
          return t >= from && t < to;
        })
        .reduce((s, o) => s + o.gross_amount, 0);
      days.push({
        label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        gross,
      });
    }
    return days;
  }, [rows]);

  const maxGross = Math.max(1, ...series.map((d) => d.gross));
  const totalUnits = rows.reduce((s, o) => s + o.quantity, 0);
  const avgOrder = rows.length ? rows.reduce((s, o) => s + o.gross_amount, 0) / rows.length : 0;
  const totalGross = rows.reduce((s, o) => s + o.gross_amount, 0);
  const listings = listingsQuery.data ?? [];
  const activeListings = listings.filter((l) => l.status === "active").length;
  const stockLeft = listings.reduce((s, l) => s + l.stock, 0);

  return (
    <DashLayout title="Analytics" nav={sellerNav}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Calculated from your actual completed and in-escrow orders.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Units sold"
            value={loading ? "—" : String(totalUnits)}
            icon={Users}
          />
          <StatCard
            label="Gross revenue"
            value={loading ? "—" : formatPrice(totalGross)}
            icon={TrendingUp}
          />
          <StatCard
            label="Average order"
            value={loading ? "—" : formatPrice(Math.round(avgOrder * 100) / 100)}
            icon={BarChart3}
          />
          <StatCard
            label="Active listings"
            value={loading ? "—" : String(activeListings)}
            icon={BarChart3}
            hint={`${stockLeft} units in stock`}
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Crunching your numbers…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No sales data yet"
            description="Once a buyer purchases one of your listings, this page charts your revenue, best-performing listings and platform mix."
            action={
              <Button className="rounded-xl" asChild>
                <Link to="/seller/listings?new=1">Create a listing</Link>
              </Button>
            }
          />
        ) : (
          <>
            <section className="glass p-6">
              <h3 className="font-semibold">Last 30 days</h3>
              <div className="mt-6 flex h-40 items-end gap-1">
                {series.map((d, i) => (
                  <div
                    key={i}
                    className="group relative flex-1"
                    title={`${d.label}: ${formatPrice(d.gross)}`}
                  >
                    <div
                      className="w-full rounded-t-sm bg-primary transition-opacity hover:opacity-80"
                      style={{
                        height: `${Math.max(2, (d.gross / maxGross) * 100)}%`,
                        opacity: d.gross > 0 ? 1 : 0.12,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>{series[0]?.label}</span>
                <span>{series[series.length - 1]?.label}</span>
              </div>
            </section>

            <section className="glass p-6">
              <h3 className="font-semibold">Top listings by revenue</h3>
              {byListing.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No sales yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {byListing.slice(0, 6).map((l) => {
                    const pct = totalGross ? (l.gross / totalGross) * 100 : 0;
                    return (
                      <li key={l.listingId}>
                        <div className="flex items-center gap-3 text-sm">
                          <BrandMark brand={l.brand} colored className="size-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{l.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {l.units} sold
                          </span>
                          <span className="w-20 text-right font-semibold tabular-nums">
                            {formatPrice(l.gross)}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="glass p-6">
              <h3 className="font-semibold">Revenue by platform</h3>
              <ul className="mt-4 space-y-3">
                {byBrand.map((b) => {
                  const pct = totalGross ? (b.gross / totalGross) * 100 : 0;
                  return (
                    <li key={b.brand}>
                      <div className="flex items-center gap-3 text-sm">
                        <BrandMark brand={b.brand} colored className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 capitalize">{b.brand}</span>
                        <span className="text-xs text-muted-foreground">
                          {b.units} sold
                        </span>
                        <span className="w-20 text-right font-semibold tabular-nums">
                          {formatPrice(b.gross)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </div>
    </DashLayout>
  );
}
