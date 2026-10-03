import { useState } from "react";
import { useQuery } from "convex/react";
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
import { DashLayout } from "@/components/dash/DashLayout";
import { sellerNav } from "@/components/dash/navs";
import { StatCard, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useDb } from "@/lib/db";
import { api as convexApi } from "@/convex/_generated/api";
import { toast } from "sonner";

export default function SellerEarnings() {
  const { withdrawals } = useDb();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank transfer");
  const [open, setOpen] = useState(false);

  // Authoritative figures come from the order ledger on the server. No
  // demo-seeded fallback: an empty ledger legitimately reads as zero.
  const summary = useQuery(convexApi.marketplace.earningsSummary);
  const loading = summary === undefined;

  const completed = summary?.grossUsd ?? 0;
  const commission = summary?.commissionUsd ?? 0;
  const escrow = summary?.escrowUsd ?? 0;
  const available = summary?.netUsd ?? 0;
  const myWithdrawals = withdrawals;
  const paidOut = myWithdrawals
    .filter((w) => w.status === "paid")
    .reduce((s, w) => s + w.amount, 0);

  const request = () => {
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (value > available) {
      toast.error("Amount exceeds your available balance.");
      return;
    }
    toast.info("Payouts are not wired up yet", {
      description:
        "Your completed sales and commission are shown above from the live ledger. Withdrawal requests will be enabled once the payout provider is connected.",
    });
    setAmount("");
    setOpen(false);
  };

  return (
    <DashLayout title="Earnings" nav={sellerNav}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            value={loading ? "—" : formatPrice(available)}
            icon={Wallet}
            hint="After the 10% fee"
          />
          <StatCard
            label="In escrow"
            value={loading ? "—" : formatPrice(escrow)}
            hint="Releases after transfer"
            icon={Wallet}
          />
        </div>

        <div className="glass p-6">
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
              <dd className="text-lg font-bold tabular-nums text-emerald-600">
                {formatPrice(available)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            The 10% commission is calculated on the server for every order and
            recorded on the order itself, so your statements always reconcile.
          </p>
        </div>

        <div className="glass p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Withdraw funds</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatPrice(paidOut)} paid out so far · payouts are processed
                within one business day.
              </p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl">Request withdrawal</Button>
              </DialogTrigger>
              <DialogContent className="glass border-border/70 sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Request withdrawal</DialogTitle>
                  <DialogDescription>
                    Available balance: {formatPrice(available)}
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
                </div>
                <DialogFooter>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button className="rounded-xl" onClick={request}>
                    Request {amount ? formatPrice(Number(amount)) : ""}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="glass overflow-hidden">
          <div className="hidden grid-cols-[1fr_8rem_9rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Withdrawal</span>
            <span>Amount</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="divide-y divide-border/60">
            {myWithdrawals.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{w.method}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(w.requestedAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="w-20 text-sm font-semibold tabular-nums">{formatPrice(w.amount)}</span>
                <span className="ml-auto"><StatusBadge status={w.status} /></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </DashLayout>
  );
}
