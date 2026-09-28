import { Link } from "react-router";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { getSeller, useDb } from "@/lib/db";

export default function AdminOrders() {
  const { orders } = useDb();

  return (
    <DashLayout title="Order management" nav={adminNav}>
      <div className="glass overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-6 py-3.5">Order</th>
              <th className="px-6 py-3.5">Seller</th>
              <th className="px-6 py-3.5">Total</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5">Placed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {orders.map((o) => (
              <tr key={o.id} className="transition-colors hover:bg-accent/30">
                <td className="px-6 py-4">
                  <Link to={`/account/orders/${o.id}`} className="font-medium hover:text-primary">
                    {o.listingTitle}
                  </Link>
                  <p className="text-xs text-muted-foreground">#{o.id}</p>
                </td>
                <td className="px-6 py-4">{getSeller(o.sellerId).name}</td>
                <td className="px-6 py-4 tabular-nums">{formatPrice(o.total)}</td>
                <td className="px-6 py-4"><StatusBadge status={o.status} /></td>
                <td className="px-6 py-4 text-muted-foreground">
                  {new Date(o.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashLayout>
  );
}
