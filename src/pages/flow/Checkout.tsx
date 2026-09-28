import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CreditCard, Landmark, Loader2, Lock, ShieldCheck, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { api, getSeller, useDb } from "@/lib/db";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type PaymentMethod = "card" | "wallet" | "bank";

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const { listings } = useDb();

  const listing = listings.find((l) => l.id === params.get("listing"));
  const qty = Math.max(1, parseInt(params.get("qty") ?? "1", 10) || 1);

  const [payment, setPayment] = useState<PaymentMethod>("card");
  const [agreed, setAgreed] = useState(false);
  const [placing, setPlacing] = useState(false);

  if (!listing) {
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

  const seller = getSeller(listing.sellerId);
  const subtotal = listing.price * qty;
  const escrowFee = Math.round(subtotal * 0.03);
  const total = subtotal + escrowFee;

  const placeOrder = () => {
    setPlacing(true);
    // In production this is a server call; price and stock are re-validated
    // server-side before payment is captured.
    window.setTimeout(() => {
      try {
        const order = api.placeOrder({
          listingId: listing.id,
          listingTitle: listing.title,
          brand: listing.brand,
          sellerId: listing.sellerId,
          quantity: qty,
          unitPrice: listing.price,
        });
        navigate(`/order/${order.id}/confirmed`);
      } finally {
        setPlacing(false);
      }
    }, 1200);
  };

  const canPlace = agreed && !!user;

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
                <BrandMark brand={listing.brand} colored className="size-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{listing.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sold by {seller.name}
                  {seller.verified && " · ID-verified"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold tabular-nums">{formatPrice(subtotal)}</p>
                <p className="text-xs text-muted-foreground">Qty {qty}</p>
              </div>
            </div>
            {!user && (
              <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700">
                You need an account to complete this purchase.{" "}
                <Link to={`/auth?returnTo=/checkout?listing=${listing.id}%26qty=${qty}`} className="font-medium underline">
                  Sign in
                </Link>
              </p>
            )}
          </section>

          {/* Payment */}
          <section className="glass p-6" aria-label="Payment method">
            <h2 className="font-semibold">Payment method</h2>
            <RadioGroup
              value={payment}
              onValueChange={(v) => setPayment(v as PaymentMethod)}
              className="mt-4 grid gap-3 sm:grid-cols-3"
            >
              {(
                [
                  { value: "card", label: "Card", icon: CreditCard, hint: "Visa, Mastercard, Amex" },
                  { value: "wallet", label: "Hub Wallet", icon: Wallet, hint: user ? `Balance ${formatPrice(user.balance)}` : "Sign in required" },
                  { value: "bank", label: "Bank transfer", icon: Landmark, hint: "Where supported" },
                ] as const
              ).map(({ value, label, icon: Icon, hint }) => (
                <Label
                  key={value}
                  htmlFor={`pay-${value}`}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1.5 rounded-xl border p-4 transition-colors",
                    payment === value
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/60 hover:bg-accent/40",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <RadioGroupItem id={`pay-${value}`} value={value} />
                    <Icon className="size-4 text-primary" />
                    <span className="text-sm font-medium">{label}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </Label>
              ))}
            </RadioGroup>
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700">
              <Lock className="size-3.5 shrink-0" />
              Demo checkout — no real payment is processed and card data is
              never collected or stored.
            </p>
          </section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="glass p-6">
            <h2 className="font-semibold">Order summary</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
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
              onClick={placeOrder}
            >
              {placing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Processing…
                </>
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
              Prices are verified server-side before payment capture.
            </Badge>
          </div>
        </aside>
      </div>
    </div>
  );
}
