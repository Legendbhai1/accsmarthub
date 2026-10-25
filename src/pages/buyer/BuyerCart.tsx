import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/Primitives";
import { LottieAnimation } from "@/components/common/LottieAnimation";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/supabaseQueries";
import {
  cartRemove,
  cartSet,
  checkoutCart,
  publicAssetUrl,
} from "@/lib/supabaseMutations";
import { useSession } from "@/lib/session";
import { useCapabilities } from "@/lib/schemaCapabilities";
import { cartTotals } from "@/lib/cartTotals";
import { toast } from "sonner";

/**
 * The buyer's cart.
 *
 * Every number on this page is re-derived on the server by the `checkout` RPC
 * before any money moves, so what is shown here is a summary and never the
 * authority. Quantities are written through `cart_set`, which also re-checks
 * availability, so a cart cannot be parked holding a quantity the listing no
 * longer has.
 */
export default function BuyerCart() {
  const navigate = useNavigate();
  const { user } = useSession();
  const cartQuery = useCart();
  // Memoised so the derived totals below do not recompute on every render —
  // `data ?? []` would otherwise be a fresh array each time.
  const lines = useMemo(() => cartQuery.data ?? [], [cartQuery.data]);
  const { cart: cartAvailable } = useCapabilities();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  // Mirrors the server's buyer-side maths in `checkout`. Commission is taken
  // from the seller's side and is deliberately not added to the buyer's total.
  const totals = useMemo(
    () =>
      cartTotals(
        lines.map((line) => ({
          unitPriceUsd: line.unitPriceUsd,
          quantity: line.quantity,
        })),
      ),
    [lines],
  );

  const blocked = lines.filter(
    (line) => line.status !== "active" || line.stock < line.quantity,
  );

  const changeQuantity = async (lineId: string, listingId: string, next: number) => {
    setBusyId(lineId);
    try {
      await cartSet({ listingId, quantity: next });
      cartQuery.refresh();
    } catch (err) {
      toast.error("Could not update the quantity", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (lineId: string, listingId: string) => {
    setBusyId(lineId);
    try {
      await cartRemove({ listingId });
      cartQuery.refresh();
    } catch (err) {
      toast.error("Could not remove the item", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const pay = async () => {
    if (lines.length === 0) return;
    setPlacing(true);
    try {
      // One order per line, created in a single server transaction. The
      // returned order number is the first one, used as the landing anchor.
      const firstOrderNo = await checkoutCart({
        cartIds: lines.map((line) => line.listingId),
      });
      toast.success("Order placed", {
        description: "Your payment is held until you confirm delivery.",
      });
      cartQuery.refresh();
      navigate(`/order/${encodeURIComponent(firstOrderNo)}/confirmed`);
    } catch (err) {
      toast.error("Could not complete the purchase", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <>
      {cartQuery.loading ? (
        <EmptyState title="Loading your cart…" description="Fetching the items you saved." />
      ) : !cartAvailable ? (
        <EmptyState
          title="The cart is not available on this server"
          description="This deployment's database has not run the cart migration yet. You can still buy any listing directly with Buy Now."
          action={
            <Button className="rounded-xl" asChild>
              <Link to="/marketplace">Browse the marketplace</Link>
            </Button>
          }
        />
      ) : cartQuery.error ? (
        <EmptyState
          title="Could not load your cart"
          description={cartQuery.error}
          action={
            <Button variant="outline" className="rounded-xl" onClick={cartQuery.refresh}>
              Try again
            </Button>
          }
        />
      ) : lines.length === 0 ? (
        <div className="surface flex flex-col items-center px-6 py-14 text-center">
          <LottieAnimation name="shopping-bag" size={150} />
          <h2 className="mt-3 text-lg font-semibold tracking-tight">
            Your cart is empty
          </h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Add an account from the marketplace and it will wait here until you
            are ready to pay.
          </p>
          <Button className="mt-5 rounded-xl" asChild>
            <Link to="/marketplace">
              <ShoppingBag className="size-4" />
              Explore the marketplace
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
          <ul className="surface divide-y divide-border/60 overflow-hidden">
            {lines.map((line) => {
              const unavailable =
                line.status !== "active" || line.stock < line.quantity;
              return (
                <li
                  key={line.id}
                  className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-6"
                >
                  <Link
                    to={`/marketplace/${line.listingId}`}
                    className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/40"
                  >
                    {line.imagePath ? (
                      <img
                        src={publicAssetUrl("listing-assets", line.imagePath)}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <BrandMark brand={line.brand} colored className="size-6" />
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/marketplace/${line.listingId}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {line.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatPrice(line.unitPriceUsd)} each ·{" "}
                      {line.stock > 0 ? `${line.stock} in stock` : "Sold out"}
                    </p>
                    {unavailable && (
                      <p className="mt-1 text-xs font-medium text-destructive">
                        No longer available in this quantity. Reduce it or remove
                        the item to continue.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-lg"
                      aria-label={`Reduce quantity of ${line.title}`}
                      disabled={busyId === line.id || line.quantity <= 1}
                      onClick={() =>
                        changeQuantity(line.id, line.listingId, line.quantity - 1)
                      }
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium tabular-nums">
                      {line.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-lg"
                      aria-label={`Increase quantity of ${line.title}`}
                      disabled={
                        busyId === line.id || line.quantity >= Math.min(line.stock, 1000)
                      }
                      onClick={() =>
                        changeQuantity(line.id, line.listingId, line.quantity + 1)
                      }
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>

                  <span className="w-20 text-right text-sm font-semibold tabular-nums">
                    {formatPrice(line.unitPriceUsd * line.quantity)}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg text-muted-foreground"
                    aria-label={`Remove ${line.title} from the cart`}
                    disabled={busyId === line.id}
                    onClick={() => remove(line.id, line.listingId)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>

          <aside className="surface space-y-3 p-5 lg:sticky lg:top-24">
            <h2 className="text-sm font-semibold">Order summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatPrice(totals.subtotalUsd)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Buyer protection</dt>
                <dd className="tabular-nums">{formatPrice(totals.buyerFeeUsd)}</dd>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-2 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPrice(totals.totalUsd)}</dd>
              </div>
            </dl>

            {user ? (
              <p className="text-xs text-muted-foreground">
                Paid from your AccsMartHub wallet. Your balance is checked and
                debited on the server when you confirm.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sign in to check out.
              </p>
            )}

            {blocked.length > 0 && (
              <p className="text-xs font-medium text-destructive">
                {blocked.length} item{blocked.length === 1 ? "" : "s"} cannot be
                bought right now. Adjust the quantity or remove them.
              </p>
            )}

            <Button
              className="w-full rounded-xl"
              disabled={placing || blocked.length > 0 || !user}
              onClick={pay}
            >
              {placing ? "Placing your order…" : `Pay ${formatPrice(totals.totalUsd)}`}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Your payment is held until you confirm the account works.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
