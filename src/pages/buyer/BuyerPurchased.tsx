import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { useDb } from "@/lib/db";

export default function BuyerPurchased() {
  const { orders } = useDb();
  const completed = orders.filter(
    (o) => o.buyerId === "u-me" && o.status === "completed",
  );

  return (
    <DashLayout title="Purchased items" nav={buyerNav}>
      {completed.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="Completed transfers appear here with their documentation."
          action={
            <Button variant="outline" className="rounded-xl" asChild>
              <Link to="/marketplace">Browse marketplace</Link>
            </Button>
          }
        />
      ) : (
        <div className="glass overflow-hidden">
          <div className="hidden grid-cols-[1fr_7rem_7rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Listing</span>
            <span className="text-right">Paid</span>
            <span className="text-right">Completed</span>
          </div>
          <ul className="divide-y divide-border/60">
            {completed.map((order) => (
              <li key={order.id} className="px-6 py-4 transition-colors hover:bg-accent/30">
                <Link to={`/account/orders/${order.id}`} className="flex flex-wrap items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
                    <BrandMark brand={order.brand} colored className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{order.listingTitle}</span>
                    <span className="text-xs text-muted-foreground">#{order.id}</span>
                  </span>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums">
                    {formatPrice(order.total)}
                  </span>
                  <span className="hidden w-24 text-right text-xs text-muted-foreground sm:block">
                    {new Date(order.updatedAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashLayout>
  );
}
