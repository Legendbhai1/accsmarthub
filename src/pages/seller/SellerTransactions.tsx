import { Download, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, StatCard, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useMyOrders } from "@/lib/supabaseQueries";
import { toast } from "sonner";

/**
 * Transactions — the seller's money ledger.
 *
 * Every row is a real order row showing the exact split the server
 * calculated: gross → platform commission → net payout. Escrow orders are
 * listed but not yet payable, so the seller can see what is coming.
 */
export default function SellerTransactions() {
  const ordersQuery = useMyOrders("seller");
  const orders = ordersQuery.data ?? [];
  const loading = ordersQuery.loading;

  const gross = orders.reduce((s, o) => s + o.gross_amount, 0);
  const commission = orders.reduce((s, o) => s + o.commission_amount, 0);
  const escrow = orders
    .filter((o) => ["in_escrow", "disputed"].includes(o.status))
    .reduce((s, o) => s + o.gross_amount, 0);
  const paid = orders
    .filter((o) => o.status === "completed")
    .reduce((s, o) => s + o.seller_net_amount, 0);

  const exportCsv = () => {
    const rows = orders.map((o) =>
      [
        o.order_no,
        o.listing_title,
        new Date(o.created_at).toISOString(),
        o.gross_amount,
        o.commission_amount,
        o.seller_net_amount,
        o.status,
      ].join(","),
    );
    const csv = [
      "Order,Listing,Date,Gross,Commission,Net,Status",
      ...rows,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Transactions exported");
  };

  return (
    <>
      <div className="seller-page space-y-6">
        <div className="seller-page-head flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="seller-sub text-sm text-muted-foreground">
              Every sale with the exact split the platform calculated.
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={exportCsv}
            disabled={loading || orders.length === 0}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>

        <div className="seller-stat-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Gross sales"
            value={loading ? "—" : formatPrice(gross)}
            icon={Wallet}
          />
          <StatCard
            label="Platform commission"
            value={loading ? "—" : `−${formatPrice(commission)}`}
            icon={Wallet}
            hint="10% of gross"
          />
          <StatCard
            label="Net paid to you"
            value={loading ? "—" : formatPrice(paid)}
            icon={Wallet}
            hint="Released on buyer confirmation"
          />
          <StatCard
            label="Currently in escrow"
            value={loading ? "—" : formatPrice(escrow)}
            icon={Wallet}
            hint="Not payable until released"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading transactions…</p>
        ) : orders.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="When a buyer purchases one of your listings, the payment appears here with its full commission breakdown."
          />
        ) : (
          <div
            className="card overflow-hidden"
            style={{ ["--seller-cols" as string]: "minmax(0,1fr) 6rem 6rem 6rem 8rem" }}
          >
            <div className="seller-grid-head">
              <span>Order</span>
              <span className="text-right">Gross</span>
              <span className="text-right">Fee</span>
              <span className="text-right">Net</span>
              <span className="text-right">Status</span>
            </div>
            <ul className="seller-grid">
              {orders.map((o) => (
                <li key={o.order_no} className="seller-grid-row">
                  <span className="seller-grid-cell">
                    <span className="block truncate text-sm font-medium">
                      {o.listing_title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {o.order_no} · {new Date(o.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="seller-grid-num text-right">
                    {formatPrice(o.gross_amount)}
                  </span>
                  <span className="seller-grid-num text-right text-destructive">
                    −{formatPrice(o.commission_amount)}
                  </span>
                  <span className="seller-grid-num text-right font-semibold">
                    {formatPrice(o.seller_net_amount)}
                  </span>
                  <span className="seller-grid-end flex justify-end">
                    <StatusBadge status={o.status} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
