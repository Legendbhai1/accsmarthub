import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { sellerNav } from "@/components/dash/navs";
import { ConfirmDialog, EmptyState, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { api, useDb, DEMO_SELLER_ID } from "@/lib/db";

export default function SellerOrders() {
  const { orders } = useDb();
  const myOrders = orders.filter((o) => o.sellerId === DEMO_SELLER_ID);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <DashLayout title="Sales & orders" nav={sellerNav}>
      {myOrders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="When a buyer purchases one of your listings, the order appears here."
        />
      ) : (
        <div className="glass overflow-hidden">
          <div className="hidden grid-cols-[1fr_8rem_9rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Order</span>
            <span>Status</span>
            <span className="text-right">Action</span>
          </div>
          <ul className="divide-y divide-border/60">
            {myOrders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{order.listingTitle}</span>
                  <span className="text-xs text-muted-foreground">
                    #{order.id} · {formatPrice(order.total)} · {new Date(order.createdAt).toLocaleDateString()}
                  </span>
                </span>
                <StatusBadge status={order.status} />
                <span className="flex w-full justify-end lg:w-auto">
                  {order.status === "in_escrow" && (
                    <Button size="sm" className="rounded-lg" onClick={() => setConfirmId(order.id)}>
                      Begin transfer
                    </Button>
                  )}
                  {order.status === "transferring" && (
                    <span className="text-xs text-muted-foreground">
                      Awaiting buyer confirmation
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={() => setConfirmId(null)}
        title="Begin the credential handover?"
        description="Confirm once you have started the secure transfer with the buyer. Escrow stays held until the buyer confirms completion."
        confirmLabel="Begin transfer"
        onConfirm={() => {
          if (confirmId) api.advanceOrder(confirmId);
        }}
      />
    </DashLayout>
  );
}
