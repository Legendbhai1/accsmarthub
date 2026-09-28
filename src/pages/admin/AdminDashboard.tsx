import { Receipt, ShieldAlert, Store, Users } from "lucide-react";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { StatCard, SectionHeading, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { payments, useDb, users } from "@/lib/db";

export default function AdminDashboard() {
  const { orders, listings, disputes } = useDb();

  const volume = payments.reduce((s, p) => s + p.amount, 0);
  const fees = payments.reduce((s, p) => s + p.fee, 0);
  const held = payments.filter((p) => p.status === "held").reduce((s, p) => s + p.amount, 0);
  const openDisputes = disputes.filter((d) => d.status !== "resolved").length;

  return (
    <DashLayout title="Admin overview" nav={adminNav}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Platform statistics</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Live snapshot of marketplace activity (demo data).
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Payment volume" value={formatPrice(volume)} icon={Receipt} hint={`Fees ${formatPrice(fees)}`} />
          <StatCard label="Held in escrow" value={formatPrice(held)} icon={Receipt} />
          <StatCard label="Users" value={String(users.length)} icon={Users} hint={`${users.filter((u) => u.status === "suspended").length} suspended`} />
          <StatCard label="Open disputes" value={String(openDisputes)} icon={ShieldAlert} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active listings" value={String(listings.filter((l) => l.status === "active").length)} icon={Store} />
          <StatCard label="Pending review" value={String(listings.filter((l) => l.status === "pending").length)} icon={Store} />
          <StatCard label="Orders" value={String(orders.length)} icon={Receipt} />
          <StatCard label="Transfers completed" value={String(orders.filter((o) => o.status === "completed").length)} icon={Receipt} />
        </div>

        <section className="glass p-6">
          <SectionHeading title="Latest orders" />
          <ul className="mt-4 divide-y divide-border/60">
            {orders.slice(0, 5).map((order) => (
              <li key={order.id} className="flex items-center gap-3 py-3">
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
          </ul>
        </section>
      </div>
    </DashLayout>
  );
}
