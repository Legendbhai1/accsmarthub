import { useState } from "react";
import { Wallet } from "lucide-react";
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
import { api, useDb } from "@/lib/db";
import { DEMO_SELLER_ID } from "@/pages/seller/SellerDashboard";
import { toast } from "sonner";

export default function SellerEarnings() {
  const { withdrawals, orders } = useDb();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank transfer");
  const [open, setOpen] = useState(false);

  const completed = orders
    .filter((o) => o.sellerId === DEMO_SELLER_ID && o.status === "completed")
    .reduce((s, o) => s + o.total, 0);
  const escrow = orders
    .filter((o) => o.sellerId === DEMO_SELLER_ID && ["in_escrow", "transferring"].includes(o.status))
    .reduce((s, o) => s + o.total, 0);
  const available = Math.round(completed * 0.92);
  const myWithdrawals = withdrawals.filter((w) => w.sellerId === DEMO_SELLER_ID);
  const paidOut = myWithdrawals.filter((w) => w.status === "paid").reduce((s, w) => s + w.amount, 0);

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
    api.requestWithdrawal(DEMO_SELLER_ID, value, method);
    toast.success("Withdrawal requested", { description: "Payouts process within one business day." });
    setAmount("");
    setOpen(false);
  };

  return (
    <DashLayout title="Earnings" nav={sellerNav}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Available to withdraw" value={formatPrice(available)} icon={Wallet} hint="After 8% platform fee" />
          <StatCard label="In escrow" value={formatPrice(escrow)} hint="Releases after transfer" icon={Wallet} />
          <StatCard label="Paid out" value={formatPrice(paidOut)} hint="Lifetime" icon={Wallet} />
        </div>

        <div className="glass p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Withdraw funds</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Payouts are processed within one business day.
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
