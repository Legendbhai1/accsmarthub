import { Link } from "react-router";
import {
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ProductArtwork } from "@/components/marketplace/ProductArtwork";
import { formatPrice, useCart } from "@/lib/cart";

export function CartDrawer() {
  const { items, total, open, setOpen, updateQuantity, remove } = useCart();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="px-5 pb-2 pt-5">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <ShoppingBag className="size-5 text-primary" />
            Your cart
            <span className="text-sm font-normal text-muted-foreground">
              ({items.reduce((n, i) => n + i.quantity, 0)})
            </span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            Account listings — funds are held in escrow until each transfer
            completes.
          </SheetDescription>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="clay-inset flex size-16 items-center justify-center rounded-3xl">
              <ShoppingBag className="size-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Your cart is empty</p>
            <p className="max-w-56 text-xs text-muted-foreground">
              Browse the marketplace and add an account to get started.
            </p>
            <Button variant="clay" className="mt-2 rounded-xl" asChild>
              <Link to="/marketplace" onClick={() => setOpen(false)}>
                Browse marketplace
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <ul className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
              {items.map((item) => (
                <li
                  key={item.slug}
                  className="clay-inset flex items-center gap-3 rounded-2xl p-3"
                >
                  <ProductArtwork brand={item.brand} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(item.price)} each
                    </p>
                    <div className="mt-2 flex items-center gap-1">
                      <Button
                        variant="clay"
                        size="icon-sm"
                        className="size-7 rounded-lg"
                        aria-label={`Decrease quantity of ${item.name}`}
                        onClick={() => updateQuantity(item.slug, item.quantity - 1)}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span
                        className="w-8 text-center text-sm font-semibold tabular-nums"
                        aria-live="polite"
                      >
                        {item.quantity}
                      </span>
                      <Button
                        variant="clay"
                        size="icon-sm"
                        className="size-7 rounded-lg"
                        aria-label={`Increase quantity of ${item.name}`}
                        onClick={() => updateQuantity(item.slug, item.quantity + 1)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto size-7 rounded-lg text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${item.name} from cart`}
                        onClick={() => remove(item.slug)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="border-t border-border/70 px-5 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-bold tabular-nums">
                  {formatPrice(total)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-400/90">
                <ShieldCheck className="size-3.5" />
                Buyer protection included · Secure checkout
              </div>
              <Button
                variant="clay"
                className="clay-btn mt-4 w-full rounded-2xl"
                asChild
              >
                <Link to="/checkout">Go to checkout</Link>
              </Button>
              <Button
                variant="ghost"
                className="mt-2 w-full rounded-xl"
                onClick={() => setOpen(false)}
              >
                Continue browsing
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
