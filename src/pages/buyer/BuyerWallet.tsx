import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowDownToLine,
  BadgeCheck,
  CircleDollarSign,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { StatCard } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useDb } from "@/lib/db";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

type DepositState =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "awaiting"; trackId: string; paymentUrl: string; amount: number };

/** Survives the redirect out to OxaPay and back. */
const PENDING_TRACK_KEY = "accsmarthub.pendingDeposit.v1";

export default function BuyerWallet() {
  const { user } = useSession();
  const { orders } = useDb();

  const [depositState, setDepositState] = useState<DepositState>({ phase: "idle" });
  const [verifying, setVerifying] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amountStr, setAmountStr] = useState("50");

  const createDeposit = useAction(api.payments.createDeposit);
  const verifyDeposit = useAction(api.payments.verifyDeposit);
  const deposits = useQuery(api.payments.myDeposits, {});

  // The webhook credits the wallet on its own; this only re-checks the
  // authoritative status once, in case the webhook was slow or blocked.
  const autoVerified = useRef(false);
  useEffect(() => {
    if (autoVerified.current) return;
    const trackId = sessionStorage.getItem(PENDING_TRACK_KEY);
    if (!trackId) return;
    autoVerified.current = true;
    void (async () => {
      try {
        const res = await verifyDeposit({ trackId });
        if (res.credited) {
          sessionStorage.removeItem(PENDING_TRACK_KEY);
          toast.success(`Deposit confirmed — ${formatPrice(res.amountUsd ?? 0)} added.`);
        }
      } catch {
        // Leave the marker so the next visit retries; the webhook still credits.
      }
    })();
  }, [verifyDeposit]);

  const mine = orders.filter((o) => o.buyerId === "u-me");

  const startDeposit = async () => {
    const amount = Math.round(Number(amountStr) * 100) / 100;
    if (!(amount >= 1)) {
      toast.error("Minimum deposit is $1.");
      return;
    }
    setDepositState({ phase: "creating" });
    try {
      const res = await createDeposit({
        amountUsd: amount,
        returnUrl: `${window.location.origin}/account/wallet`,
      });
      setDepositState({ phase: "awaiting", trackId: res.trackId, paymentUrl: res.paymentUrl, amount });
      try {
        sessionStorage.setItem(PENDING_TRACK_KEY, res.trackId);
      } catch {
        // storage unavailable — the manual check still works
      }
      window.open(res.paymentUrl, "_blank", "noopener,noreferrer");
      toast.info("Complete the payment in the OxaPay window", {
        description: "We'll verify your deposit when you return.",
      });
    } catch (err) {
      setDepositState({ phase: "idle" });
      toast.error("Could not start deposit", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  const checkDeposit = async () => {
    if (depositState.phase !== "awaiting") return;
    const { trackId, amount } = depositState;
    setVerifying(true);
    try {
      const res = await verifyDeposit({ trackId });
      if (res.credited) {
        // The wallet is credited server-side; the reactive query updates the
        // balance shown above the moment this returns.
        const creditedAmount = res.amountUsd ?? amount;
        toast.success(`Deposit confirmed — ${formatPrice(creditedAmount)} added to your wallet.`);
        sessionStorage.removeItem(PENDING_TRACK_KEY);
        setDepositState({ phase: "idle" });
        setDialogOpen(false);
      } else {
        toast.info(`Payment status: ${res.status}`, {
          description: "Once OxaPay confirms, your wallet updates automatically.",
        });
      }
    } catch (err) {
      toast.error("Verification failed", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setVerifying(false);
    }
  };

  const busy = depositState.phase === "creating" || verifying;

  return (
    <DashLayout title="Wallet" nav={buyerNav}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Available balance" value={formatPrice(user?.balance ?? 0)} icon={Wallet} hint="Usable at checkout" />
          <StatCard
            label="Held in escrow"
            value={formatPrice(user?.lockedBalance ?? 0)}
            icon={ArrowDownToLine}
            hint="Released to the seller on your confirmation"
          />
        </div>

        <div className="glass p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Top up with crypto</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Deposits are processed securely by OxaPay in USDT and other
                major cryptocurrencies.
              </p>
            </div>
            <Button className="rounded-xl" onClick={() => { setDialogOpen(true); }}>
              <CircleDollarSign className="size-4" />
              Deposit funds
            </Button>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700">
            <BadgeCheck className="size-3.5 shrink-0" />
            Funds appear in your wallet as soon as OxaPay confirms the
            payment — the balance is spendable immediately at checkout.
          </div>
          <p className="mt-3 rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
            Deposits are credited by the server the moment the payment
            provider confirms. Add{" "}
            <code className="font-mono">OXAPAY_MERCHANT_API_KEY</code> in the
            Keys tab to switch the crypto gateway on.
          </p>
        </div>

        {/* Live deposit status — the webhook flips these in real time. */}
        <div className="glass p-6">
          <h3 className="font-semibold">Deposits</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Every top-up is confirmed by OxaPay and credited to your wallet
            automatically.
          </p>
          {!deposits || deposits.length === 0 ? (
            <p className="mt-4 rounded-xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
              No deposits yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60 text-sm">
              {deposits.map((d) => (
                <li key={d._id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{formatPrice(d.amountUsd)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString()} ·{" "}
                      <span className="font-mono">{d.trackId}</span>
                    </p>
                  </div>
                  <span
                    className={
                      d.status === "paid"
                        ? "rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
                        : "rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-700"
                    }
                  >
                    {d.status === "paid" ? "Credited" : "Awaiting payment"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass p-6">
          <h3 className="font-semibold">Transaction history</h3>
          <ul className="mt-4 divide-y divide-border/60 text-sm">
            {mine.slice(0, 6).map((order) => (
              <li key={order.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{order.listingTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    #{order.id} · {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">−{formatPrice(order.total)}</p>
                  <p className="text-xs capitalize text-muted-foreground">{order.status.replace(/_/g, " ")}</p>
                </div>
              </li>
            ))}
            {mine.length === 0 && (
              <li className="py-6 text-center text-muted-foreground">No transactions yet.</li>
            )}
          </ul>
        </div>
      </div>

      {/* Deposit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!busy) setDialogOpen(open); }}>
        <DialogContent className="glass border-border/70 sm:max-w-md">
          {depositState.phase === "awaiting" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Clock className="size-4 text-primary" />
                  Awaiting payment
                </DialogTitle>
                <DialogDescription>
                  {formatPrice(depositState.amount)} deposit · Track ID{" "}
                  <span className="font-mono text-xs">{depositState.trackId}</span>
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Pay in the OxaPay window that opened. Come back here and press
                check — the wallet credit is applied the moment OxaPay reports
                the payment as paid.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  className="rounded-xl"
                  disabled={busy}
                  onClick={checkDeposit}
                >
                  {verifying ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {verifying ? "Checking…" : "I've paid — check status"}
                </Button>
                <Button variant="outline" className="rounded-xl" asChild>
                  <a href={depositState.paymentUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                    Reopen payment page
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-xl"
                  disabled={busy}
                  onClick={() => setDepositState({ phase: "idle" })}
                >
                  Cancel this deposit
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Deposit funds</DialogTitle>
                <DialogDescription>
                  Enter an amount in USD. You'll pay with crypto through
                  OxaPay's secure checkout.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="deposit-amount">Amount (USD)</Label>
                <Input
                  id="deposit-amount"
                  type="number"
                  min={1}
                  step="1"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="inset-well rounded-xl border-border/60"
                  placeholder="50"
                />
                <div className="flex gap-2">
                  {[25, 50, 100, 250].map((v) => (
                    <Button
                      key={v}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-lg"
                      onClick={() => setAmountStr(String(v))}
                    >
                      ${v}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum deposit is $1. Need funds for a specific listing?{" "}
                  <Link to="/marketplace" className="underline">
                    Browse the marketplace
                  </Link>
                  .
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  className="rounded-xl"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button className="rounded-xl" disabled={busy} onClick={startDeposit}>
                  {depositState.phase === "creating" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CircleDollarSign className="size-4" />
                  )}
                  {depositState.phase === "creating" ? "Creating invoice…" : "Continue to payment"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashLayout>
  );
}
