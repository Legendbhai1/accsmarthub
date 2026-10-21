import { useState } from "react";
import {
  Wallet,
  Search,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { usePayoutQueue } from "@/lib/supabaseQueries";
import { resolvePayout } from "@/lib/supabaseMutations";
import { toast } from "sonner";

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
  { key: "payouts", label: "Payouts" },
] as const;

export default function AdminPayments() {
  const [tab, setTab] = useState<string>("completed");
  const [q, setQ] = useState("");

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payoutsQuery = usePayoutQueue();
  const [decision, setDecision] = useState<{
    id: string;
    kind: "paid" | "rejected";
    amount: number;
    /** What actually goes out: `amount` minus the platform withdrawal fee. */
    net: number;
    fee: number;
    pool: "spend" | "earn";
  } | null>(null);
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

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

  const openPayouts = (payoutsQuery.data ?? []).filter(
    (p) => p.status === "requested" || p.status === "approved",
  );

  /** Saves the currently filtered order set as a CSV the admin can open. */
  const exportCsv = () => {
    const header = "order_no,seller_id,gross_amount,commission_amount,seller_net_amount,status,created_at";
    const body = filtered
      .map((r) =>
        [r.order_no, r.seller_id, r.gross_amount, r.commission_amount,
         r.seller_net_amount, r.status, r.created_at].join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accsmarthub-${tab}-payments.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const settle = async () => {
    if (!decision) return;
    if (note.trim().length < 3) {
      toast.error("A reason is required for the decision.");
      return;
    }
    setSaving(true);
    try {
      await resolvePayout({
        payoutId: decision.id,
        decision: decision.kind,
        note: note.trim(),
        paidReference: decision.kind === "paid" ? reference.trim() : undefined,
      });
      setDecision(null);
      setNote("");
      setReference("");
      payoutsQuery.refresh();
      toast.success(decision.kind === "paid" ? "Payout marked paid" : "Payout rejected");
    } catch (err) {
      toast.error("Could not settle the payout", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

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
            <Wallet className="size-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="size-4 mr-2" />
            Export
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Could not load payments: {error}
          </div>
        )}

        {tab === "payouts" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {openPayouts.length === 0
                ? "No withdrawals are waiting for review."
                : `${openPayouts.length} withdrawal${openPayouts.length === 1 ? "" : "s"} waiting for review. The funds are already held.`}
            </p>
            {payoutsQuery.loading ? (
              <EmptyState title="Loading withdrawals…" description="Fetching the payout queue." />
            ) : (payoutsQuery.data ?? []).length === 0 ? (
              <EmptyState
                title="No withdrawal requests"
                description="Seller withdrawal requests will appear here for review."
              />
            ) : (
              <div className="surface overflow-hidden">
                <ul className="divide-y divide-border/60">
                  {(payoutsQuery.data ?? []).map((p) => (
                    <li key={p.id} className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {formatPrice(p.netUsd)} to send · {p.method}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.pool === "earn" ? "Sale proceeds" : "Deposited funds"}
                            {" · "}
                            {formatPrice(p.amountUsd)} requested,{" "}
                            {formatPrice(p.feeUsd)} fee · {p.destination} ·
                            requested {new Date(p.requestedAt).toLocaleDateString()}
                          </span>
                          {p.reviewNote && (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              Note: {p.reviewNote}
                            </span>
                          )}
                        </div>
                        <StatusBadge status={p.status} />
                        {(p.status === "requested" || p.status === "approved") && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="rounded-xl"
                              onClick={() => {
                                setDecision({
                                  id: p.id,
                                  kind: "paid",
                                  amount: p.amountUsd,
                                  net: p.netUsd,
                                  fee: p.feeUsd,
                                  pool: p.pool,
                                });
                                setNote("");
                                setReference("");
                              }}
                            >
                              Mark paid
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              onClick={() => {
                                setDecision({
                                  id: p.id,
                                  kind: "rejected",
                                  amount: p.amountUsd,
                                  net: p.netUsd,
                                  fee: p.feeUsd,
                                  pool: p.pool,
                                });
                                setNote("");
                                setReference("");
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : isLoading ? (
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

            <div className="surface overflow-hidden">
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

      <Dialog open={Boolean(decision)} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent className="card border-border/70 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {decision?.kind === "paid" ? "Mark payout paid" : "Reject payout"}
            </DialogTitle>
            <DialogDescription>
              {decision?.kind === "paid"
                ? `Confirm you have sent ${formatPrice(decision?.net ?? 0)} to the seller (${formatPrice(decision?.amount ?? 0)} requested, ${formatPrice(decision?.fee ?? 0)} platform fee retained). This releases the hold.`
                : `Return ${formatPrice(decision?.amount ?? 0)} of ${
                    decision?.pool === "earn" ? "sale proceeds" : "deposited funds"
                  } to the seller's balance.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="payout-note">Reason (recorded in the audit log)</Label>
              <Input
                id="payout-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. sent via TRC-20"
                className="inset-well rounded-xl border-border/60"
              />
            </div>
            {decision?.kind === "paid" && (
              <div className="grid gap-2">
                <Label htmlFor="payout-ref">Transaction reference (optional)</Label>
                <Input
                  id="payout-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Bank or chain reference"
                  className="inset-well rounded-xl border-border/60"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={settle}
              disabled={saving || note.trim().length < 3}
            >
              {saving ? "Saving…" : decision?.kind === "paid" ? "Confirm paid" : "Confirm rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashLayout>
  );
}
