import { CircleDollarSign, RotateCcw, Percent } from "lucide-react";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { SectionHeading, StatCard } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { categories, payments, useDb } from "@/lib/db";

export default function AdminReports() {
  const { orders, listings } = useDb();

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
