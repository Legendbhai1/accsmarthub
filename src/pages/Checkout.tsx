import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  CreditCard,
  Landmark,
  Lock,
  ShieldCheck,
  Tag,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProductArtwork } from "@/components/marketplace/ProductArtwork";
import { SiteHeader } from "@/components/marketplace/SiteHeader";
import { SiteFooter } from "@/components/marketplace/SiteFooter";
import { formatPrice, useCart } from "@/lib/cart";
import { cn } from "@/lib/utils";

const PROMO_CODES: Record<string, number> = {
  ESCROW15: 0.15,
  WELCOME10: 0.1,
};

type PaymentMethod = "card" | "wallet" | "bank";

export default function Checkout() {
  const navigate = useNavigate();
  const { items, total, updateQuantity, remove, clear } = useCart();
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("card");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", country: "" });

  const discount = promoCode ? total * (PROMO_CODES[promoCode] ?? 0) : 0;
  const serviceFee = total > 0 ? 1.2 : 0;
  const grandTotal = Math.max(0, total - discount + serviceFee);

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (PROMO_CODES[code]) {
      setPromoCode(code);
      toast.success(`Promo ${code} applied — ${PROMO_CODES[code] * 100}% off`);
    } else {
      toast.error("That promo code isn't valid.");
    }
  };

  const canPlace =
    items.length > 0 &&
    agreedToTerms &&
    form.name.trim() !== "" &&
    /.+@.+\..+/.test(form.email) &&
    form.country.trim() !== "";

  const placeOrder = () => {
    setPlacing(true);
    window.setTimeout(() => {
      clear();
      setPlacing(false);
      setConfirmOpen(false);
      navigate("/order-confirmed");
    }, 1400);
  };

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <div className="clay flex flex-col items-center px-10 py-14">
            <h1 className="text-xl font-semibold">Your cart is empty</h1>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Browse the marketplace and add an account to get started — every
              purchase is protected by escrow.
            </p>
            <Button variant="clay" className="mt-6 rounded-xl" asChild>
              <Link to="/marketplace">Browse marketplace</Link>
            </Button>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
          <p className="mt-2 text-muted-foreground">
            Your payment is held in escrow and released to the seller only after
            you confirm the transfer.
          </p>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem]">
            {/* ---------- Left column ---------- */}
            <div className="min-w-0 space-y-6">
              {/* Cart items */}
              <section className="clay p-6" aria-label="Cart items">
                <h2 className="font-semibold">Your accounts</h2>
                <ul className="mt-4 space-y-3">
                  {items.map((item) => (
                    <li
                      key={item.slug}
                      className="clay-inset flex items-center gap-3 rounded-2xl p-3"
                    >
                      <ProductArtwork brand={item.brand} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.name}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <button
                            type="button"
                            className="size-6 rounded-lg border border-border/60 font-semibold tabular-nums transition-colors hover:text-foreground"
                            aria-label={`Decrease quantity of ${item.name}`}
                            onClick={() =>
                              updateQuantity(item.slug, item.quantity - 1)
                            }
                          >
                            −
                          </button>
                          <span className="tabular-nums">{item.quantity}</span>
                          <button
                            type="button"
                            className="size-6 rounded-lg border border-border/60 font-semibold tabular-nums transition-colors hover:text-foreground"
                            aria-label={`Increase quantity of ${item.name}`}
                            onClick={() =>
                              updateQuantity(item.slug, item.quantity + 1)
                            }
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="ml-2 inline-flex items-center gap-1 hover:text-destructive"
                            onClick={() => remove(item.slug)}
                          >
                            <Trash2 className="size-3" /> Remove
                          </button>
                        </div>
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Billing */}
              <section className="clay p-6" aria-label="Billing information">
                <h2 className="font-semibold">Billing information</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="bill-name">Full name</Label>
                    <Input
                      id="bill-name"
                      className="clay-inset rounded-2xl border-border/60"
                      placeholder="Ada Lovelace"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      autoComplete="name"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="bill-email">Email for delivery</Label>
                    <Input
                      id="bill-email"
                      type="email"
                      className="clay-inset rounded-2xl border-border/60"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, email: e.target.value }))
                      }
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="bill-country">Country</Label>
                    <Input
                      id="bill-country"
                      className="clay-inset rounded-2xl border-border/60"
                      placeholder="United States"
                      value={form.country}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, country: e.target.value }))
                      }
                      autoComplete="country-name"
                      required
                    />
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Transfer coordination and escrow updates are sent to this
                  email address.
                </p>
              </section>

              {/* Payment */}
              <section className="clay p-6" aria-label="Payment method">
                <h2 className="font-semibold">Payment method</h2>
                <RadioGroup
                  value={payment}
                  onValueChange={(v) => setPayment(v as PaymentMethod)}
                  className="mt-4 grid gap-3 sm:grid-cols-3"
                >
                  {(
                    [
                      {
                        value: "card",
                        label: "Card",
                        icon: CreditCard,
                        hint: "Via compliant processor",
                      },
                      {
                        value: "wallet",
                        label: "Hub Wallet",
                        icon: Wallet,
                        hint: "Balance: $42.00 (demo)",
                      },
                      {
                        value: "bank",
                        label: "Bank transfer",
                        icon: Landmark,
                        hint: "Where supported",
                      },
                    ] as const
                  ).map(({ value, label, icon: Icon, hint }) => (
                    <Label
                      key={value}
                      htmlFor={`pay-${value}`}
                      className={cn(
                        "flex cursor-pointer flex-col gap-1.5 rounded-2xl border p-4 transition-all",
                        payment === value
                          ? "border-primary/60 bg-primary/10"
                          : "border-border/60 hover:bg-accent/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem id={`pay-${value}`} value={value} />
                        <Icon className="size-4 text-primary" />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {hint}
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
                {payment === "card" && (
                  <p className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
                    <Lock className="size-3.5 shrink-0" />
                    Demo checkout — no card form is shown because real payments
                    require a connected provider. Raw card data is never stored
                    by our platform.
                  </p>
                )}
              </section>
            </div>

            {/* ---------- Right: summary ---------- */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="clay p-6">
                <h2 className="font-semibold">Order summary</h2>

                {/* Promo */}
                <div className="mt-4">
                  <Label htmlFor="promo" className="text-xs text-muted-foreground">
                    Promo code
                  </Label>
                  <div className="mt-1.5 flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="promo"
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value)}
                        placeholder="ESCROW15"
                        className="clay-inset rounded-2xl border-border/60 pl-9 uppercase"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl"
                      onClick={applyPromo}
                    >
                      Apply
                    </Button>
                  </div>
                  {promoCode && (
                    <Badge className="mt-2 rounded-full bg-emerald-500/15 text-emerald-400">
                      {promoCode} active
                    </Badge>
                  )}
                </div>

                <Separator className="my-5" />

                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd className="tabular-nums">{formatPrice(total)}</dd>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <dt>Discount ({promoCode})</dt>
                      <dd className="tabular-nums">
                        −{formatPrice(discount)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Service fee</dt>
                    <dd className="tabular-nums">{formatPrice(serviceFee)}</dd>
                  </div>
                  <Separator className="!my-3" />
                  <div className="flex justify-between text-base font-bold">
                    <dt>Total</dt>
                    <dd className="tabular-nums">{formatPrice(grandTotal)}</dd>
                  </div>
                </dl>

                <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 size-4 accent-[oklch(0.72_0.15_229)]"
                    required
                  />
                  <span>
                    I agree to the Terms of Service, Privacy Policy and Refund
                    Policy, and I understand the escrow and dispute process.
                  </span>
                </label>

                <Button
                  variant="clay"
                  className="clay-btn mt-4 h-11 w-full rounded-2xl"
                  disabled={!canPlace || placing}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Lock className="size-4" />
                  {placing ? "Processing…" : `Fund escrow · ${formatPrice(grandTotal)}`}
                </Button>

                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-emerald-400/90">
                  <ShieldCheck className="size-3.5" />
                  Funds held in escrow · Buyer protection included
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="clay border-border/70">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your order</AlertDialogTitle>
            <AlertDialogDescription>
              Your payment of {formatPrice(grandTotal)} will be held in escrow
              while the transfer is completed. Coordination begins at{" "}
              <span className="font-medium text-foreground">{form.email}</span>{" "}
              immediately after payment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Back</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={placing}
              onClick={(e) => {
                e.preventDefault();
                placeOrder();
              }}
            >
              <Lock className="size-4" />
              {placing ? "Processing…" : "Pay now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SiteFooter />
    </div>
  );
}
