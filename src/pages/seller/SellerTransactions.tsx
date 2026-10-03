import { useQuery } from "convex/react";
import { Download, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { sellerNav } from "@/components/dash/navs";
import { EmptyState, StatCard, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { api as convexApi } from "@/convex/_generated/api";
import { toast } from "sonner";

/**
 * Transactions — the seller's money ledger.
 *
 * Every row is a real order row showing the exact split the server
 * calculated: gross → platform commission → net payout. Escrow orders are
 * listed but not yet payable, so the seller can see what is coming.
 */
export default function SellerTransactions() {
  const orders = useQuery(convexApi.marketplace.salesOrders);
  const loading = orders === undefined;

  const gross = (orders ?? []).reduce((s, o) => s + o.grossAmount, 0);
  const commission = (orders ?? []).reduce((s, o) => s + o.commissionAmount, 0);
  const escrow = (orders ?? [])
    .filter((o) => ["in_escrow", "transferring", "disputed"].includes(o.status))
    .reduce((s, o) => s + o.grossAmount, 0);
  const paid = (orders ?? [])
    .filter((o) => o.status === "completed")
    .reduce((s, o) => s + o.sellerNetAmount, 0);

  const exportCsv = () => {
    const rows = (orders ?? []).map((o) =>
      [
        o.orderNo,
        o.listingTitle,
        new Date(o.createdAt).toISOString(),
        o.grossAmount,
        o.commissionAmount,
        o.sellerNetAmount,
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
    <DashLayout title="Transactions" nav={sellerNav}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Every sale with the exact split the platform calculated.
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={exportCsv}
            disabled={loading || (orders ?? []).length === 0}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        ) : (orders ?? []).length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="When a buyer purchases one of your listings, the payment appears here with its full commission breakdown."
          />
        ) : (
          <div className="glass overflow-hidden">
            <div className="hidden grid-cols-[1fr_7rem_7rem_7rem_8rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
              <span>Order</span>
              <span className="text-right">Gross</span>
              <span className="text-right">Fee</span>
              <span className="text-right">Net</span>
              <span className="text-right">Status</span>
            </div>
            <ul className="divide-y divide-border/60">
              {(orders ?? []).map((o) => (
                <li
                  key={o._id}
                  className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {o.listingTitle}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {o.orderNo} · {new Date(o.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="w-20 text-right text-sm tabular-nums">
                    {formatPrice(o.grossAmount)}
                  </span>
                  <span className="w-20 text-right text-sm tabular-nums text-destructive">
                    −{formatPrice(o.commissionAmount)}
                  </span>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums">
                    {formatPrice(o.sellerNetAmount)}
                  </span>
                  <span className="ml-auto">
                    <StatusBadge status={o.status} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DashLayout>
  );
}
