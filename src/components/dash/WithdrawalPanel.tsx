import { useState } from "react";
import { ArrowUpRight, Info, Loader2, Wallet } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPrice } from "@/lib/format";
import { requestPayout } from "@/lib/supabaseMutations";
import { useMyPayouts } from "@/lib/supabaseQueries";
import {
  formatFeeRate,
  splitWithdrawal,
  type WithdrawalTier,
} from "@/lib/withdrawalTiers";
import { toast } from "sonner";

const METHODS = ["Bank transfer", "USDT (TRC-20)", "Payoneer"] as const;

/**
 * The withdrawal form, shared by the buyer wallet and the seller earnings page.
 *
 * Both audiences withdraw from a different pool on a different floor and fee,
 * but the form itself is identical — so the tier is passed in rather than the
 * page duplicating the dialog. The server re-checks all of it; this only makes
 * the rules visible before the user submits, so a below-floor amount is caught
 * with a helpful message instead of a round trip.
 */
export function WithdrawalPanel({
  tier,
  available,
  title,
  description,
  onDone,
}: {
  tier: WithdrawalTier;
  /** How much of the tier's pool this account can withdraw, after holds. */
  available: number;
  title: string;
  description: string;
  /** Called after a successful request, to refresh balances and the list. */
  onDone?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(METHODS[0]);
  const [destination, setDestination] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const payoutsQuery = useMyPayouts();

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0;
  const { fee, net } = valid ? splitWithdrawal(value, tier) : { fee: 0, net: 0 };
  const belowFloor = valid && value < tier.minimum;
  const aboveBalance = valid && value > available;
  // The fee is deducted from the requested amount, so a request can only be
  // impossible if the fee exceeds it — which the floor makes unreachable here,
  // but the server still guards it.
  const canSubmit =
    valid &&
    !belowFloor &&
    !aboveBalance &&
    destination.trim().length >= 3 &&
    !submitting;

  const reset = () => {
    setAmount("");
    setDestination("");
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await requestPayout({ amount: value, method, destination: destination.trim() });
      reset();
      setOpen(false);
      await Promise.all([payoutsQuery.refresh(), Promise.resolve(onDone?.())]);
      toast.success("Withdrawal requested", {
        description: `${formatPrice(value)} is held while our team reviews it. You will receive ${formatPrice(net)} after the ${formatFeeRate(tier.feeRate)} fee.`,
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
    <div className="surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="icon-tile size-9" style={{ ["--tile" as string]: "var(--pop-green)" }}>
            <Wallet className="size-4" />
          </span>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <Button
          className="rounded-xl"
          disabled={available < tier.minimum}
          onClick={() => {
            setOpen(true);
          }}
        >
          <ArrowUpRight className="size-4" />
          Withdraw
        </Button>
      </div>

      {/* The rules, stated before the form rather than after a failure. */}
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="inset-well rounded-xl px-4 py-3">
          <dt className="text-xs text-muted-foreground">Available to withdraw</dt>
          <dd className="text-lg font-bold tabular-nums">{formatPrice(available)}</dd>
        </div>
        <div className="inset-well rounded-xl px-4 py-3">
          <dt className="text-xs text-muted-foreground">Minimum</dt>
          <dd className="text-lg font-bold tabular-nums">{formatPrice(tier.minimum)}</dd>
        </div>
        <div className="inset-well rounded-xl px-4 py-3">
          <dt className="text-xs text-muted-foreground">Withdrawal fee</dt>
          <dd className="text-lg font-bold tabular-nums">{formatFeeRate(tier.feeRate)}</dd>
        </div>
      </dl>

      {available < tier.minimum && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          You need at least {formatPrice(tier.minimum)} of{" "}
          {tier.balanceLabel} to request a withdrawal. The fee is deducted from
          the amount you request.
        </p>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!submitting) setOpen(next);
        }}
      >
        <DialogContent className="surface border-border/70 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request withdrawal</DialogTitle>
            <DialogDescription>
              {formatPrice(available)} of {tier.balanceLabel} is available.
              Minimum {formatPrice(tier.minimum)}, fee {formatFeeRate(tier.feeRate)}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="withdraw-amount">Amount (USD)</Label>
              <Input
                id="withdraw-amount"
                type="number"
                min={tier.minimum}
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="inset-well rounded-xl border-border/60"
                placeholder={String(tier.minimum)}
              />
              {belowFloor && (
                <p role="alert" className="text-xs text-warning">
                  The minimum withdrawal is {formatPrice(tier.minimum)}.
                </p>
              )}
              {aboveBalance && (
                <p role="alert" className="text-xs text-warning">
                  You can withdraw at most {formatPrice(available)} of{" "}
                  {tier.balanceLabel}.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="withdraw-method">Payout method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="withdraw-method" className="inset-well rounded-xl border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="withdraw-destination">
                {method === "Bank transfer"
                  ? "Account number or IBAN"
                  : method === "Payoneer"
                    ? "Payoneer email"
                    : "Wallet address"}
              </Label>
              <Input
                id="withdraw-destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="inset-well rounded-xl border-border/60"
                placeholder={
                  method === "Bank transfer"
                    ? "GB00 TEST 0000 0000"
                    : method === "Payoneer"
                      ? "you@example.com"
                      : "T..."
                }
              />
              <p className="text-xs text-muted-foreground">
                Check this carefully — a payout cannot be reversed once sent.
              </p>
            </div>

            {/* The fee arithmetic, shown as the user types. */}
            {valid && !belowFloor && (
              <div className="inset-well rounded-xl px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Amount requested</span>
                  <span className="font-medium tabular-nums">{formatPrice(value)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Withdrawal fee ({formatFeeRate(tier.feeRate)})
                  </span>
                  <span className="font-medium tabular-nums text-destructive">
                    −{formatPrice(fee)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between border-t border-border/60 pt-1.5">
                  <span className="font-semibold">You receive</span>
                  <span className="font-bold tabular-nums text-success">
                    {formatPrice(net)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              className="rounded-xl"
              disabled={submitting}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button className="rounded-xl" disabled={!canSubmit} onClick={submit}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting ? "Requesting…" : "Request withdrawal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
