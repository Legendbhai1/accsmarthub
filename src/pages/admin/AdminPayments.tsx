import { useState } from "react";
import {
  Wallet,
  Search,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { supabase } from "@/lib/supabase";

type PaymentRow = {
  order_no: string;
  seller_id: string;
  gross_amount: number;
  commission_amount: number;
  seller_net_amount: number;
  status: string;
  created_at: string;
};

const TABS = [
  { key: "completed", label: "Completed" },
  { key: "in_escrow", label: "In escrow" },
  { key: "disputed", label: "Disputed" },
] as const;

export default function AdminPayments() {
  const [tab, setTab] = useState<string>("completed");
  const [q, setQ] = useState("");

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("order_no, seller_id, gross_amount, commission_amount, seller_net_amount, status, created_at")
        .in("status", ["completed", "in_escrow", "disputed"])
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      setRows(
        (data ?? []).filter((r) => r.status === tab).map((r) => ({
          ...r,
          gross_amount: Number(r.gross_amount ?? 0),
          commission_amount: Number(r.commission_amount ?? 0),
          seller_net_amount: Number(r.seller_net_amount ?? 0),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const loadOnce = () => {
    let ran = false;
    load().then(() => {
      if (!ran) ran = true;
    });
  };

  const filtered =
    q.trim()
      ? rows.filter((r) =>
          r.order_no.toLowerCase().includes(q.trim().toLowerCase())
        )
      : rows;

  const totals = rows.reduce(
    (s, r) => ({
      gross: s.gross + r.gross_amount,
      commission: s.commission + r.commission_amount,
      net: s.net + r.seller_net_amount,
    }),
    { gross: 0, commission: 0, net: 0 } as { gross: number; commission: number; net: number }
  );

  return (
    <DashLayout title="Payment management" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          View deposits, payouts, and payment health. Filter by settlement state
          and search orders by number to investigate a specific payout.
        </p>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by order number"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button className="rounded-xl" onClick={loadOnce}>
            <Wallet className="size-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" className="rounded-xl">
            <Download className="size-4 mr-2" />
            Export
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Could not load payments: {error}
          </div>
        )}

        {isLoading ? (
          <EmptyState
            title="Loading payments…"
            description={`Fetching the ${tab} queue.`}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={q.trim() ? "No payments found" : `No ${tab} payments`}
            description={
              q.trim()
                ? "Try a different search term."
                : `There are no ${tab} payments right now.`
            }
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border-border/70 bg-card p-5 text-card-foreground shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Gross collected
                </p>
                <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">
                  {formatPrice(totals.gross)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  What buyers paid across the filtered set.
                </p>
              </div>
              <div className="rounded-2xl border-border/70 bg-card p-5 text-card-foreground shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Platform commission
                </p>
                <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">
                  {formatPrice(totals.commission)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Platform take before seller payouts.
                </p>
              </div>
              <div className="rounded-2xl border-border/70 bg-card p-5 text-card-foreground shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Seller net
                </p>
                <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">
                  {formatPrice(totals.net)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  What would flow to sellers after settlement.
                </p>
              </div>
            </div>

            <div className="glass overflow-hidden">
              <div className="hidden grid-cols-[1fr_8rem_8rem_8rem_7rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                <span>Order</span>
                <span className="text-right">Gross</span>
                <span className="text-right">Commission</span>
                <span className="text-right">Seller net</span>
                <span className="text-right">Created</span>
              </div>
              <ul className="divide-y divide-border/60">
                {filtered.map((r) => (
                  <li
                    key={r.order_no}
                    className="px-6 py-4 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {r.order_no}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Seller {r.seller_id.slice(0, 8)}…
                        </span>
                      </div>
                      <span className="w-20 text-right text-sm tabular-nums">
                        {formatPrice(r.gross_amount)}
                      </span>
                      <span className="w-20 text-right text-sm tabular-nums">
                        {formatPrice(r.commission_amount)}
                      </span>
                      <span className="w-20 text-right text-sm tabular-nums">
                        {formatPrice(r.seller_net_amount)}
                      </span>
                      <span className="w-20 text-right text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </DashLayout>
  );
}
