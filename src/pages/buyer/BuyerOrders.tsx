import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { EmptyState, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useDb, type OrderStatus } from "@/lib/db";
import { cn } from "@/lib/utils";

const FILTERS: { label: string; values: OrderStatus[] | "all" }[] = [
  { label: "All", values: "all" },
  { label: "In escrow", values: ["in_escrow"] },
  { label: "Transferring", values: ["transferring"] },
  { label: "Completed", values: ["completed"] },
  { label: "Disputed / refunded", values: ["disputed", "refunded"] },
];

export default function BuyerOrders() {
  const { orders } = useDb();
  const [filter, setFilter] = useState<string>("all");

  const mine = orders.filter((o) => o.buyerId === "u-me");
  const activeFilter = FILTERS.find((f) => f.label === filter);
  const list =
    activeFilter && activeFilter.values !== "all"
      ? mine.filter((o) => (activeFilter.values as OrderStatus[]).includes(o.status))
      : mine;

  return (
    <DashLayout title="My orders" nav={buyerNav}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setFilter(f.label)}
              aria-pressed={filter === f.label}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                filter === f.label
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/70 text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <EmptyState
            title="No orders here"
            description="Orders appear here once you complete a checkout."
            action={
              <Button variant="outline" className="rounded-xl" asChild>
                <Link to="/marketplace">Browse marketplace</Link>
              </Button>
            }
          />
        ) : (
          <div className="glass overflow-hidden">
            <div className="hidden grid-cols-[1fr_8rem_8rem_7rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Listing</span>
              <span>Status</span>
              <span className="text-right">Total</span>
              <span className="text-right">Placed</span>
            </div>
            <ul className="divide-y divide-border/60">
              {list.map((order) => (
                <li key={order.id} className="px-6 py-4 transition-colors hover:bg-accent/30">
                  <Link to={`/account/orders/${order.id}`} className="block">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {order.listingTitle}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          #{order.id} · Qty {order.quantity}
                        </span>
                      </span>
                      <StatusBadge status={order.status} />
                      <span className="w-20 text-right text-sm font-semibold tabular-nums">
                        {formatPrice(order.total)}
                      </span>
                      <span className="hidden w-24 text-right text-xs text-muted-foreground sm:block">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DashLayout>
  );
}
