import { useMemo, useState } from "react";
import { CircleDollarSign, RotateCcw, Percent, ShieldAlert } from "lucide-react";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState, SectionHeading, StatCard, StatusBadge } from "@/components/common/Primitives";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { categories } from "@/lib/db";
import { useReports, usePlatformStats, useAllOrders } from "@/lib/supabaseQueries";
import { resolveReport } from "@/lib/supabaseMutations";
import { toast } from "sonner";

const REPORT_LABELS: Record<string, string> = {
  shared_contact: "Shared contact details",
  payment_offsite: "Payment moved off-platform",
  refused_escrow: "Refused escrow",
  impersonation: "Impersonated staff",
  other: "Other breach",
};

export default function AdminReports() {
  const [filter, setFilter] = useState<string>("open");
  const reportsQuery = useReports(filter);
  const statsQuery = usePlatformStats();
  const ordersQuery = useAllOrders();

  const reports = reportsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];

  const volume = statsQuery.data?.grossVolumeUsd ?? 0;
  const refunded = orders
    .filter((o) => o.status === "refunded")
    .reduce((s, o) => s + o.gross_amount, 0);
  const disputed = orders.filter((o) => o.status === "disputed").length;
  const finished = orders.filter((o) =>
    ["completed", "disputed", "refunded"].includes(o.status),
  ).length;
  const disputeRate = finished ? (disputed / finished) * 100 : 0;

  const refresh = () => {
    void reportsQuery.refresh();
    void ordersQuery.refresh();
    void statsQuery.refresh();
  };

  // Category share of active listings.
  const byCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) counts.set(o.brand, (counts.get(o.brand) ?? 0) + o.quantity);
    return categories
      .map((c) => ({ name: c.name, count: counts.get(c.brand) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);
  const max = Math.max(1, ...byCategory.map((c) => c.count));

  return (
    <DashLayout title="Reports" nav={adminNav}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Payment volume" value={formatPrice(volume)} icon={CircleDollarSign} />
          <StatCard label="Refunded" value={formatPrice(refunded)} icon={RotateCcw} />
          <StatCard
            label="Dispute rate"
            value={`${disputeRate.toFixed(1)}%`}
            icon={Percent}
            hint={`${disputed} disputed of ${finished} settled orders`}
          />
        </div>

        {/* Off-platform contact enforcement queue */}
        <section className="glass p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading
              title="Off-platform contact reports"
              subtitle="Sharing contact details or moving payment off AccsMartHub is prohibited and can pause a seller's listings."
            />
            <div className="flex gap-1.5">
              {(["open", "reviewing", "resolved", "dismissed"] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  className="rounded-lg capitalize"
                  onClick={() => setFilter(f)}
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>

          {reportsQuery.loading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading reports…</p>
          ) : reports.length === 0 ? (
            <EmptyState
              title="Nothing in this queue"
              description="Buyer reports of off-platform contact land here."
            />
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {reports.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">
                        {REPORT_LABELS[r.reason] ?? r.reason}
                      </p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                      {r.order_no && ` · order ${r.order_no}`}
                      {r.penalty && ` · penalty: ${r.penalty}`}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{r.detail}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      className="rounded-lg"
                      onClick={async () => {
                        try {
                          await resolveReport({
                            reportId: r.id,
                            status: "resolved",
                            penalty: "Listings paused and payout held pending review",
                          });
                          refresh();
                          toast.success("Report actioned", {
                            description: "The seller's listings were paused.",
                          });
                        } catch (err) {
                          toast.error("Could not resolve", {
                            description:
                              err instanceof Error ? err.message : "Please try again.",
                          });
                        }
                      }}
                    >
                      Uphold &amp; pause listings
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={async () => {
                        try {
                          await resolveReport({
                            reportId: r.id,
                            status: "dismissed",
                          });
                          refresh();
                          toast("Report dismissed");
                        } catch (err) {
                          toast.error("Could not dismiss", {
                            description:
                              err instanceof Error ? err.message : "Please try again.",
                          });
                        }
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass p-6">
          <SectionHeading
            title="Active listings by platform"
            subtitle="Units sold, by platform."
          />
          <ul className="mt-5 space-y-3">
            {byCategory.map((c) => (
              <li key={c.name} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-sm">{c.name}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                  <span
                    className="block h-full rounded-full bg-primary/70"
                    style={{ width: `${(c.count / max) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right text-sm tabular-nums text-muted-foreground">
                  {c.count}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass p-6">
          <SectionHeading
            title="Order outcomes"
            subtitle="All orders on the platform."
          />
          <ul className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Completed", value: orders.filter((o) => o.status === "completed").length },
              { label: "In progress", value: orders.filter((o) => o.status === "in_escrow").length },
              { label: "Disputed / refunded", value: orders.filter((o) => ["disputed", "refunded"].includes(o.status)).length },
            ].map((row) => (
              <li key={row.label} className="inset-well rounded-xl px-4 py-3.5">
                <p className="text-xl font-bold tabular-nums">{row.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{row.label}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DashLayout>
  );
}
