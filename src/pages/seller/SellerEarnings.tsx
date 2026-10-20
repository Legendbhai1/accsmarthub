import { useState } from "react";
import { Percent, Wallet } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SellerLayout } from "@/components/dash/SellerLayout";
import { EmptyState, StatCard, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useEarningsSummary, useMyPayouts } from "@/lib/supabaseQueries";
import { requestPayout } from "@/lib/supabaseMutations";
import { toast } from "sonner";

/** Earnings — payouts and available balance for the seller. */
export default function SellerEarnings() {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank transfer");
  const [destination, setDestination] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { user } = useSession();
  const summaryQuery = useEarningsSummary();
  const payoutsQuery = useMyPayouts();
  const loading = summaryQuery.loading;

  const completed = summaryQuery.data?.grossUsd ?? 0;
  const commission = summaryQuery.data?.commissionUsd ?? 0;
  const escrow = summaryQuery.data?.escrowUsd ?? 0;

  // The wallet balance is what the server actually checks, and it already
  // excludes escrow still in flight and anything an open payout has reserved.
  // Deriving "available" from order history instead would count escrow twice.
  const available = user?.balance ?? 0;
  const pendingPayouts = (payoutsQuery.data ?? [])
    .filter((p) => p.status === "requested" || p.status === "approved")
    .reduce((s, p) => s + p.amountUsd, 0);
  const withdrawable = Math.max(0, available - pendingPayouts);

  const request = async () => {
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (value > withdrawable) {
      toast.error("Amount exceeds your available balance.", {
        description: `${formatPrice(withdrawable)} is available after any pending withdrawals.`,
      });
      return;
    }
    if (destination.trim().length < 3) {
      toast.error("Enter where the payout should be sent.");
      return;
    }
    setSubmitting(true);
    try {
      await requestPayout({ amount: value, method, destination: destination.trim() });
      setAmount("");
      setDestination("");
      setOpen(false);
      await Promise.all([payoutsQuery.refresh(), summaryQuery.refresh()]);
      toast.success("Withdrawal requested", {
        description: "The amount is held while our team reviews it.",
      });
    } catch (err) {
      toast.error("Could not request the withdrawal", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SellerLayout>
      <div className="seller-page space-y-6">
        <div className="seller-page-head">
          <p className="seller-sub text-sm text-muted-foreground">
            What you have earned, what escrow still holds, and what you can withdraw.
          </p>
        </div>

        <div className="seller-stat-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Gross sales"
            value={loading ? "—" : formatPrice(completed)}
            icon={Wallet}
            hint="Before platform commission"
          />
          <StatCard
            label="Platform commission (10%)"
            value={loading ? "—" : `−${formatPrice(commission)}`}
            icon={Percent}
            hint="Deducted from every completed sale"
          />
          <StatCard
            label="Available to withdraw"
            value={loading ? "—" : formatPrice(withdrawable)}
            icon={Wallet}
            hint={pendingPayouts > 0 ? `${formatPrice(pendingPayouts)} held for review` : "After the 10% fee"}
          />
          <StatCard
            label="In escrow"
            value={loading ? "—" : formatPrice(escrow)}
            hint="Releases after transfer"
            icon={Wallet}
          />
        </div>

        <div className="card">
          <h3 className="font-semibold">How your payout is calculated</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div className="inset-well rounded-xl px-4 py-3">
              <dt className="text-xs text-muted-foreground">Item price</dt>
              <dd className="text-lg font-bold tabular-nums">{formatPrice(completed)}</dd>
            </div>
            <div className="inset-well rounded-xl px-4 py-3">
              <dt className="text-xs text-muted-foreground">AccsMartHub fee (10%)</dt>
              <dd className="text-lg font-bold tabular-nums text-destructive">
                −{formatPrice(commission)}
              </dd>
            </div>
            <div className="inset-well rounded-xl px-4 py-3">
              <dt className="text-xs text-muted-foreground">You receive</dt>
              <dd className="text-lg font-bold tabular-nums text-success">
                {formatPrice(available)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            The 10% commission is calculated on the server for every order and
            recorded on the order itself, so your statements always reconcile.
          </p>
        </div>

        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Withdraw funds</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Request a withdrawal and our team settles it. The amount is held
                from the moment you request it.
              </p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl" disabled={withdrawable <= 0}>
                  Request withdrawal
                </Button>
              </DialogTrigger>
              <DialogContent className="card border-border/70 sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Request withdrawal</DialogTitle>
                  <DialogDescription>
                    Available to withdraw: {formatPrice(withdrawable)}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="withdraw-amount">Amount (USD)</Label>
                    <Input
                      id="withdraw-amount"
                      type="number"
                      min={1}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="inset-well rounded-xl border-border/60"
                      placeholder="1000"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Method</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger className="inset-well rounded-xl border-border/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bank transfer">Bank transfer</SelectItem>
                        <SelectItem value="USDT (TRC-20)">USDT (TRC-20)</SelectItem>
                        <SelectItem value="Payoneer">Payoneer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="withdraw-destination">
                      {method === "USDT (TRC-20)" ? "Wallet address" : "Account details"}
                    </Label>
                    <Input
                      id="withdraw-destination"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="inset-well rounded-xl border-border/60"
                      placeholder={
                        method === "USDT (TRC-20)" ? "TRC-20 address" : "Account or email"
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Only our review team sees this.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button className="rounded-xl" onClick={request} disabled={submitting}>
                    {submitting ? "Requesting…" : `Request ${amount ? formatPrice(Number(amount)) : ""}`}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="seller-table-head hidden grid-cols-[1fr_8rem_9rem] gap-4 border-b border-border/70 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Withdrawal</span>
            <span>Amount</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="divide-y divide-border/60">
            {payoutsQuery.loading ? (
              <li className="px-5 py-6 text-sm text-muted-foreground">Loading your withdrawals…</li>
            ) : (payoutsQuery.data ?? []).length === 0 ? (
              <li className="px-5 py-6">
                <EmptyState
                  title="No withdrawals yet"
                  description="Request a withdrawal above and it will appear here while it is reviewed."
                />
              </li>
            ) : (
              (payoutsQuery.data ?? []).map((p) => (
                <li
                  key={p.id}
                  className="seller-order-row flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6"
                >
                  <span className="seller-order-cell min-w-0 flex-1">
                    <span className="seller-order-title block text-sm font-medium">
                      {p.method} · {p.destination}
                    </span>
                    <span className="seller-order-meta text-xs text-muted-foreground">
                      Requested {new Date(p.requestedAt).toLocaleDateString()}
                      {p.reviewNote ? ` — ${p.reviewNote}` : ""}
                    </span>
                  </span>
                  <span className="w-20 text-sm font-semibold tabular-nums">
                    {formatPrice(p.amountUsd)}
                  </span>
                  <span className="ml-auto">
                    <StatusBadge status={p.status} />
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </SellerLayout>
  );
}
