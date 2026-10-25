import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, EmptyState, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { markOrderDelivered } from "@/lib/supabaseMutations";
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
      <>
        <EmptyState
          title="Not signed in"
          description="Sign in to see your orders."
        />
      </>
    );
  }

  return (
    <>
      <div className="seller-page space-y-6">
        <div className="seller-page-head flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="seller-sub text-sm text-muted-foreground">
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
          <div
            className="card overflow-hidden"
            style={{ ["--seller-cols" as string]: "minmax(0,1fr) 8rem 10rem" }}
          >
            <div className="seller-grid-head">
              <span>Order</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>
            <ul className="seller-grid">
              {myOrders.map((order) => (
                <li key={order.order_no} className="seller-grid-row">
                  <span className="seller-grid-cell">
                    <span className="block truncate text-sm font-medium">
                      {order.listing_title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {order.order_no} · {formatPrice(order.gross_amount)} ·{" "}
                      {new Date(order.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  <StatusBadge status={order.status} />
                  <span className="seller-grid-end flex flex-wrap justify-end">
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
                      <span className="text-xs text-muted-foreground">
                        Escrow released
                      </span>
                    )}
                    {order.status === "disputed" && (
                      <span className="text-xs text-destructive">Under dispute</span>
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
    </>
  );
}
