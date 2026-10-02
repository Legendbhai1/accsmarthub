import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CircleDollarSign, RotateCcw, Percent, ShieldAlert } from "lucide-react";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState, SectionHeading, StatCard, StatusBadge } from "@/components/common/Primitives";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { categories, payments, useDb } from "@/lib/db";
import { api as convexApi } from "@/convex/_generated/api";
import { toast } from "sonner";

const REPORT_LABELS: Record<string, string> = {
  shared_contact: "Shared contact details",
  payment_offsite: "Payment moved off-platform",
  refused_escrow: "Refused escrow",
  impersonation: "Impersonated staff",
  other: "Other breach",
};

export default function AdminReports() {
  const { orders, listings } = useDb();
  const [filter, setFilter] = useState<string>("open");
  const reports = useQuery(convexApi.reports.openReports, { status: filter });
  const resolveReport = useMutation(convexApi.reports.resolveReport);

  const volume = payments.reduce((s, p) => s + p.amount, 0);
  const refunded = payments
    .filter((p) => p.status === "refunded")
    .reduce((s, p) => s + p.amount, 0);

  // Category share of active listings (simple demo report)
  const active = listings.filter((l) => l.status === "active");
  const byCategory = categories
    .map((c) => ({
      name: c.name,
      brand: c.brand,
      count: active.filter((l) => l.category === c.slug).length,
    }))
    .sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...byCategory.map((c) => c.count));

  return (
    <DashLayout title="Reports" nav={adminNav}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Payment volume" value={formatPrice(volume)} icon={CircleDollarSign} />
          <StatCard label="Refunded" value={formatPrice(refunded)} icon={RotateCcw} />
          <StatCard label="Dispute rate" value="2.1%" icon={Percent} hint="Of completed orders" />
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

          {!reports || reports.length === 0 ? (
            <EmptyState
              title="Nothing in this queue"
              description="Buyer reports of off-platform contact land here."
            />
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {reports.map((r) => (
                <li key={r._id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">
                        {REPORT_LABELS[r.reason] ?? r.reason}
                      </p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                      {r.orderId && ` · order ${r.orderId}`}
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
                            reportId: r._id,
                            outcome: "resolved",
                            suspendSellerListings: true,
                            penalty: "Listings paused and payout held pending review",
                          });
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
                            reportId: r._id,
                            outcome: "dismissed",
                            suspendSellerListings: false,
                          });
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
            subtitle="Distribution across the top categories."
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
            subtitle="All orders in the current demo period."
          />
          <ul className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Completed", value: orders.filter((o) => o.status === "completed").length },
              { label: "In progress", value: orders.filter((o) => ["in_escrow", "transferring"].includes(o.status)).length },
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
