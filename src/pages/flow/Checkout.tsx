import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Loader2, Lock, ShieldCheck, Wallet, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BrandMark } from "@/components/site/BrandMark";
import { QuantityStepper, StockBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useLiveStock } from "@/lib/supabaseQueries";
import { placeOrder } from "@/lib/supabaseMutations";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useSession();

  const listingId = params.get("listing");

  // Live stock and price come straight from Supabase, so a signed-in buyer sees
  // the same inventory and pricing that checkout and the seller both use.
  const live = useLiveStock(listingId ? [listingId] : []);
  const liveRow = listingId ? live.data?.[listingId] : undefined;
  const liveStock = liveRow?.stock ?? 0;
  const livePrice = liveRow?.priceUsd ?? 0;

  const [agreed, setAgreed] = useState(false);
  const [placing, setPlacing] = useState(false);
  // Seed from ?qty= but never let the URL exceed what is actually in stock —
  // otherwise a hand-edited link shows a bogus total and fails at submit.
  const [qty, setQty] = useState<number>(() => {
    const requested = parseInt(params.get("qty") ?? "1", 10);
    const safe = Number.isFinite(requested) && requested > 0 ? requested : 1;
    return safe;
  });

  const runPlaceOrder = async () => {
    if (!listingId) return;
    setPlacing(true);
    try {
      const order = await placeOrder({ listingId, quantity: qty });
      navigate(`/order/${encodeURIComponent(order.order_no)}/confirmed`);
    } catch (err) {
      toast.error("Could not complete this purchase.", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setPlacing(false);
    }
  };

  if (!listingId) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Nothing to check out</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Open a listing from the marketplace to start a purchase.
        </p>
        <Button variant="outline" className="mt-6 rounded-xl" asChild>
          <Link to="/marketplace">Browse marketplace</Link>
        </Button>
      </div>
    );
  }

  const available = Math.max(0, liveStock);
  const unitPrice = livePrice;
  const soldOut = !live.loading && available <= 0;
  const subtotal = unitPrice * qty;
  const escrowFee = Math.round(subtotal * 0.03);
  const total = subtotal + escrowFee;
  // What the seller keeps after the 10% platform commission.
  const commission = Math.round(subtotal * 0.1);
  const sellerNet = subtotal - commission;

  // One real payment path: funds move server-side from the wallet into escrow,
// so there is no simulated card charge anywhere in the flow.
  const canPlace =
    agreed &&
    !!user &&
    !live.loading &&
    !soldOut &&
    user.balance >= total;

  const walletShort = !!user && user.balance < total;

  const submitOrder = async () => {
    if (!user) return;
    if (user.balance < total) {
      toast.error("Insufficient wallet balance.", {
        description: "Top up with crypto from your wallet page.",
      });
      return;
    }
    await runPlaceOrder();
  };

  const sellerName = "AccsMartHub seller";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Secure checkout</h1>
      <p className="mt-2 text-muted-foreground">
        Your payment is held in escrow and released to the seller only after
        you confirm the transfer.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem]">
        {/* Left column */}
        <div className="min-w-0 space-y-6">
          {/* Order item */}
          <section className="glass p-6" aria-label="Order item">
            <h2 className="font-semibold">Your order</h2>
            <div className="mt-4 flex items-center gap-4">
              <span className="flex size-14 items-center justify-center rounded-xl border border-border/70 bg-muted/40">
                <BrandMark brand={liveRow?.brand ?? "instagram"} colored className="size-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{liveRow?.title ?? "Listing"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sold by {sellerName}
                </p>
                <div className="mt-2">
                  <StockBadge stock={available} />
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold tabular-nums">{formatPrice(unitPrice)}</p>
                <p className="text-xs text-muted-foreground">Qty {qty}</p>
              </div>
            </div>
            {soldOut ? (
              <p className="mt-4 rounded-full bg-muted px-4 py-3 text-xs text-muted-foreground">
                This listing has sold out.{" "}
                <Link to="/marketplace" className="font-medium underline">
                  Find similar accounts
                </Link>
              </p>
            ) : (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <span className="text-sm font-medium">How many do you need?</span>
                <QuantityStepper value={qty} max={available} onChange={setQty} />
              </div>
            )}
            {!user && (
              <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700">
                You need an account to complete this purchase.{" "}
                <Link to={`/auth?returnTo=/checkout?listing=${listingId}%26qty=${qty}`} className="font-medium underline">
                  Sign in
                </Link>
              </p>
            )}
          </section>

          {/* Payment */}
          <section className="glass p-6" aria-label="Payment method">
            <h2 className="font-semibold">Payment method</h2>
            <div className="mt-4 flex flex-col gap-1.5 rounded-xl border border-primary/60 bg-primary/10 p-4">
              <span className="flex items-center gap-2">
                <Wallet className="size-4 text-primary" />
                <span className="text-sm font-medium">AccsMartHub wallet</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {user
                  ? user.balance >= total
                    ? `Balance ${formatPrice(user.balance)} · ${formatPrice(total)} needed`
                    : `Need ${formatPrice(total - user.balance)} more`
                  : "Sign in required"}
              </span>
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700">
              <Lock className="mt-px size-3.5 shrink-0" />
              No card details are ever collected. Top up the wallet with crypto
              and pay from it — funds move from your balance into escrow on the
              server in a single transaction the moment you confirm.
            </p>
            {walletShort && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700">
                <span className="flex-1">
                  Your wallet is {formatPrice((user?.balance ?? 0) - total)} short. Top
                  up with crypto to complete this purchase.
                </span>
                <Link to="/account/wallet" className="inline-flex items-center gap-1 font-medium underline">
                  <ArrowRightLeft className="size-3.5" />
                  Top up wallet
                </Link>
              </div>
            )}
          </section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="glass p-6">
            <h2 className="font-semibold">Order summary</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Subtotal{" "}
                  <span className="text-xs">({formatPrice(unitPrice)} × {qty})</span>
                </dt>
                <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Escrow & protection (3%)</dt>
                <dd className="tabular-nums">{formatPrice(escrowFee)}</dd>
              </div>
              <Separator className="!my-3" />
              <div className="flex justify-between text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPrice(total)}</dd>
              </div>
            </dl>
            <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              The seller receives {formatPrice(sellerNet)} of your{" "}
              {formatPrice(subtotal)} subtotal. AccsMartHub retains a 10%
              platform commission ({formatPrice(commission)}); escrow covers
              transfers and disputes.
            </p>
            {live.error ? (
              <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                Could not load live stock and pricing. Refresh and try again.
              </p>
            ) : live.loading ? (
              <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Checking live stock and pricing…
              </p>
            ) : null}

            <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 size-4 accent-[oklch(0.75_0.13_230)]"
                required
              />
              <span>
                I agree to the Terms of Service, Privacy Policy and understand
                the escrow and dispute process.
              </span>
            </label>

            <Button
              className="mt-4 h-11 w-full rounded-xl"
              disabled={!canPlace || placing}
              onClick={submitOrder}
            >
              {placing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Processing…
                </>
              ) : live.loading ? (
                "Loading…"
              ) : soldOut ? (
                "Sold out"
              ) : (
                <>
                  <Lock className="size-4" />
                  Fund escrow · {formatPrice(total)}
                </>
              )}
            </Button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-emerald-600">
              <ShieldCheck className="size-3.5" />
              Funds held until you approve the transfer
            </p>
            <Badge variant="secondary" className="mt-3 w-full justify-center rounded-lg bg-muted/60 text-[11px] font-normal text-muted-foreground">
              Price, stock and commission are all re-verified on the server
              before funds are taken.
            </Badge>
          </div>
        </aside>
      </div>
    </div>
  );
}
