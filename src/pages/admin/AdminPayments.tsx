import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { payments } from "@/lib/db";

export default function AdminPayments() {
  const volume = payments.reduce((s, p) => s + p.amount, 0);
  const fees = payments.reduce((s, p) => s + p.fee, 0);

  return (
    <DashLayout title="Payment management" nav={adminNav}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-6 text-sm">
          <p className="text-muted-foreground">
            Volume: <span className="font-semibold text-foreground">{formatPrice(volume)}</span>
          </p>
          <p className="text-muted-foreground">
            Platform fees: <span className="font-semibold text-foreground">{formatPrice(fees)}</span>
          </p>
        </div>

        <div className="glass overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3.5">Payment</th>
                <th className="px-6 py-3.5">Buyer → Seller</th>
                <th className="px-6 py-3.5">Amount</th>
                <th className="px-6 py-3.5">Fee</th>
                <th className="px-6 py-3.5">Method</th>
                <th className="px-6 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {payments.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-accent/30">
                  <td className="px-6 py-4">
                    <p className="max-w-52 truncate font-medium">{p.listingTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.id} · {p.orderId} · {p.date}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {p.buyer} → {p.seller}
                  </td>
                  <td className="px-6 py-4 tabular-nums">{formatPrice(p.amount)}</td>
                  <td className="px-6 py-4 tabular-nums text-muted-foreground">{formatPrice(p.fee)}</td>
                  <td className="px-6 py-4">{p.method}</td>
                  <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Payment status changes come from verified provider webhooks in
          production — never from client input.
        </p>
      </div>
    </DashLayout>
  );
}
