import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, EmptyState, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { SellerLayout } from "@/components/dash/SellerLayout";
import { markOrderDelivered, type OrderRow } from "@/lib/supabaseMutations";
import { fetchOrder, useMyOrders } from "@/lib/supabaseQueries";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export default function SellerOrders() {
  const { user } = useSession();
  const ordersQuery = useMyOrders("seller");
  const myOrders = ordersQuery.data ?? [];
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const reload = useCallback(async () => {
    if (!confirmId) return;
    try {
      await fetchOrder(confirmId);
    } catch {
      // refresh hint only; useMyOrders re-renders from the real query
    }
  }, [confirmId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const beginTransfer = async () => {
    if (!confirmId) return;
    setAdvancing(true);
    try {
      await markOrderDelivered({ orderNo: confirmId, method: "digital" });
      toast.success("Delivery started", {
        description: "The buyer can now confirm the transfer and release escrow.",
      });
      setConfirmId(null);
    } catch (err) {
      toast.error("Could not start the transfer", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setAdvancing(false);
    }
  };

  if (!user) {
    return (
      <SellerLayout>
        <EmptyState
          title="Not signed in"
          description="Sign in to see your orders."
        />
      </SellerLayout>
    );
  }

  return (
    <SellerLayout>
      <div className="seller-page space-y-6">
        <div className="seller-page-head flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Orders</h2>
            <p className="seller-sub mt-1 text-sm text-muted-foreground">
              Sales and credential transfers from your listings.
            </p>
          </div>
        </div>

        {myOrders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="When a buyer purchases one of your listings, the order appears here."
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="seller-table-head hidden grid-cols-[1fr_8rem_9rem] gap-4 border-b border-border/70 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
              <span>Order</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>
            <ul className="divide-y divide-border/60">
              {myOrders.map((order) => (
                <li key={order.order_no} className="seller-order-row flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
                  <span className="seller-order-cell min-w-0 flex-1">
                    <span className="seller-order-title block truncate text-sm font-medium">
                      {order.listing_title}
                    </span>
                    <span className="seller-order-meta text-xs text-muted-foreground">
                      {order.order_no} · {formatPrice(order.gross_amount)} ·{" "}
                      {new Date(order.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  <StatusBadge status={order.status} />
                  <span className="seller-order-action flex w-full justify-end lg:w-auto">
                    {order.status === "in_escrow" && (
                      <Button
                        size="sm"
                        className="rounded-lg"
                        onClick={() => setConfirmId(order.order_no)}
                        disabled={advancing}
                      >
                        {advancing && confirmId === order.order_no ? (
                          "Starting…"
                        ) : (
                          "Begin transfer"
                        )}
                      </Button>
                    )}
                    {order.status === "completed" && (
                      <span className="seller-order-meta text-xs text-muted-foreground">
                        Escrow released
                      </span>
                    )}
                    {order.status === "disputed" && (
                      <span className="seller-order-meta text-xs text-destructive">
                        Under dispute
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
          onConfirm={beginTransfer}
        />
      </div>
    </SellerLayout>
  );
}
