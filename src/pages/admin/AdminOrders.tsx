import { useCallback, useEffect, useState } from "react";
import { Search, Receipt, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { refundOrder } from "@/lib/supabaseMutations";
import { toast } from "sonner";

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [refundFor, setRefundFor] = useState<OrderRow | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Promise chain rather than an async function: the mount effect must not
  // call setState synchronously, or React reports a cascading render.
  const load = useCallback(() => {
    return Promise.resolve(
      supabase
        .from("orders")
        .select("order_no, listing_title, brand, buyer_id, seller_id, total_usd, status, created_at")
        .eq("status", tab)
        .order("created_at", { ascending: false }),
    )
      .then(({ data, error: fetchError }) => {
        if (fetchError) throw new Error(fetchError.message);
        setRows(
          (data ?? []).map((r) => ({
            ...r,
            total_usd: Number(r.total_usd ?? 0),
          })),
        );
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Unknown error"),
      )
      .finally(() => setIsLoading(false));
  }, [tab]);

  // Load on mount and on tab change; the queue used to be empty until Refresh.
  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    setIsLoading(true);
    void load();
  };

  const selectTab = (next: string) => {
    setIsLoading(true);
    setTab(next);
  };

  const submitRefund = async () => {
    if (!refundFor) return;
    if (note.trim().length < 3) {
      toast.error("A refund reason is required.");
      return;
    }
    setSaving(true);
    try {
      await refundOrder({ orderNo: refundFor.order_no, note: note.trim() });
      toast.success("Order refunded", { description: refundFor.order_no });
      setRefundFor(null);
      setNote("");
      await load();
    } catch (err) {
      toast.error("Could not refund the order", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
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
              onClick={() => selectTab(t.key)}
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
          <Button className="rounded-xl" onClick={refresh} disabled={isLoading}>
            <Receipt className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
                    <span className="w-24 text-right text-xs text-muted-foreground truncate">
                      {r.buyer_id.slice(0, 8)}…
                    </span>
                    <StatusBadge status={r.status} />
                    <span className="w-20 text-right text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                    {/* Refund is only valid while the money is still held; the
                        RPC enforces the same rule server-side. */}
                    <div className="flex w-28 justify-end">
                      {r.status === "in_escrow" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => {
                            setRefundFor(r);
                            setNote("");
                          }}
                        >
                          <Undo2 className="size-3.5 mr-1.5" />
                          Refund
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Dialog open={refundFor !== null} onOpenChange={(open) => !open && setRefundFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Refund order {refundFor?.order_no}</DialogTitle>
              <DialogDescription>
                This returns the held funds to the buyer and closes the order.
                The reason is recorded on the audit trail.
              </DialogDescription>
            </DialogHeader>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Why is this order being refunded?"
              className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
            />
            <DialogFooter>
              <Button variant="outline" className="rounded-xl" onClick={() => setRefundFor(null)}>
                Cancel
              </Button>
              <Button
                className="rounded-xl"
                disabled={saving || note.trim().length < 3}
                onClick={() => void submitRefund()}
              >
                {saving ? "Refunding…" : "Refund order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashLayout>
  );
}
