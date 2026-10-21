import { Link, useLocation } from "react-router";
import {
  Heart,
  LayoutGrid,
  LifeBuoy,
  Package,
  Receipt,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { BrandMark } from "@/components/site/BrandMark";
import { categories } from "@/lib/db";
import { cn } from "@/lib/utils";

/**
 * The quick-action bar that sits directly under the buyer header.
 *
 * A shopping site expects the catalogue one tap away from anywhere in the
 * account area, not only from the landing page. This bar carries the platform
 * categories as icon links into the filtered marketplace, plus the handful of
 * destinations a buyer reaches for while browsing (cart, orders, saved,
 * support) — so the buyer does not have to open the rail to move around.
 *
 * It renders for the buyer workspace only. Seller Studio and the admin console
 * are work surfaces with their own rails; a row of storefront categories
 * inside them was the same mistake as mounting the public tab bar there.
 *
 * The strip scrolls horizontally on a phone rather than wrapping, so the bar
 * stays one row tall and the page content is not pushed down.
 */
const QUICK_ACTIONS = [
  { label: "All categories", to: "/marketplace/categories", icon: LayoutGrid },
  { label: "Featured", to: "/marketplace", icon: Sparkles },
  { label: "Cart", to: "/account/cart", icon: ShoppingCart },
  { label: "Orders", to: "/account/orders", icon: Receipt },
  { label: "Purchased", to: "/account/purchased", icon: Package },
  { label: "Saved", to: "/account/saved", icon: Heart },
  { label: "Support", to: "/account/support", icon: LifeBuoy },
] as const;

export function BuyerQuickNav() {
  const { pathname } = useLocation();

  const chipClass = (active: boolean) =>
    cn(
      "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150",
      active
        ? "border-primary/30 bg-primary/10 text-primary"
        : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
    );

  return (
    <div className="border-b border-border bg-muted/30">
      <div
        // `no-scrollbar` keeps the strip clean on touch; it still scrolls.
        className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-6"
      >
        <span className="sr-only" id="buyer-quick-nav-label">
          Shop by category and quick links
        </span>
        <ul
          aria-labelledby="buyer-quick-nav-label"
          className="flex items-center gap-2"
        >
          {QUICK_ACTIONS.map(({ label, to, icon: Icon }) => (
            <li key={to} className="flex">
              <Link
                to={to}
                className={chipClass(pathname === to.split("?")[0])}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            </li>
          ))}

          {/* A hairline separating the account links from the catalogue. */}
          <li aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-border" />

          {categories.map((category) => (
            <li key={category.slug} className="flex">
              <Link
                to={`/marketplace?category=${category.slug}`}
                className={chipClass(false)}
              >
                <BrandMark
                  brand={category.brand}
                  className="size-3.5 shrink-0"
                />
                <span className="whitespace-nowrap">{category.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
