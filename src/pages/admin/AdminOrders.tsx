import { useState } from "react";
import {
  Search,
  Receipt,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { supabase } from "@/lib/supabase";

const TABS = [
  { key: "in_escrow", label: "In escrow" },
  { key: "completed", label: "Completed" },
  { key: "disputed", label: "Disputed" },
  { key: "refunded", label: "Refunded" },
] as const;

type OrderRow = {
  order_no: string;
  listing_title: string;
  brand: string;
  buyer_id: string;
  seller_id: string;
  total_usd: number;
  status: string;
  created_at: string;
};

export default function AdminOrders() {
  const [tab, setTab] = useState<string>("in_escrow");
  const [q, setQ] = useState("");

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("order_no, listing_title, brand, buyer_id, seller_id, total_usd, status, created_at")
        .eq("status", tab)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      setRows(
        (data ?? []).map((r) => ({
          ...r,
          total_usd: Number(r.total_usd ?? 0),
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
      ? rows.filter(
          (r) =>
            r.order_no.toLowerCase().includes(q.trim().toLowerCase()) ||
            r.listing_title.toLowerCase().includes(q.trim().toLowerCase())
        )
      : rows;

  return (
    <DashLayout title="Order management" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          View and manage platform orders. Escrow, completed, disputed, and
          refunded orders each show on their own tab so you can work an issue
          queue quickly.
        </p>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
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
            <Receipt className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Could not load orders: {error}
          </div>
        )}

        {isLoading ? (
          <EmptyState
            title="Loading orders…"
            description={`Fetching the ${tab} queue.`}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={q.trim() ? "No orders found" : `No ${tab} orders`}
            description={
              q.trim()
                ? "Try a different search term."
                : `There are no ${tab} orders right now.`
            }
          />
        ) : (
          <div className="surface overflow-hidden">
            <div className="hidden grid-cols-[1fr_8rem_8rem_8rem_7rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Order</span>
              <span className="text-right">Total</span>
              <span className="text-right">Buyer</span>
              <span className="text-right">Created</span>
              <span className="text-right">Actions</span>
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
                        {r.listing_title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.order_no} · {r.brand}
                      </span>
                    </div>
                    <span className="w-20 text-right text-sm font-semibold tabular-nums">
                      {formatPrice(r.total_usd)}
                    </span>
                    <span className="w-20 text-right text-xs text-muted-foreground truncate">
                      {r.buyer_id.slice(0, 8)}…
                    </span>
                    <span className="w-20 text-right text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex flex-col w-20 gap-1.5">
                      <Button variant="outline" size="sm" className="rounded-lg w-full">
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DashLayout>
  );
}
