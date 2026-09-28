import { Link } from "react-router";
import { BadgeCheck, ShoppingBag, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ProductArtwork,
} from "@/components/marketplace/ProductArtwork";
import { Stars } from "@/components/marketplace/Stars";
import { getCategory, getSeller } from "@/data/catalog";
import { formatPrice, useCart } from "@/lib/cart";
import type { Product } from "@/data/catalog";

export function ProductCard({ product }: { product: Product }) {
  const category = getCategory(product.category);
  const seller = getSeller(product.sellerId);
  const { add } = useCart();
  const outOfStock = product.stock === 0;
  const lowStock = product.stock > 0 && product.stock <= 20;

  return (
    <article className="clay clay-hover group flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <ProductArtwork icon={product.icon} hue={product.hue} />
        <Badge
          variant="secondary"
          className="border-border/60 bg-muted/60 text-muted-foreground backdrop-blur-sm"
        >
          {category.name}
        </Badge>
      </div>

      <h3 className="mt-4 text-base font-semibold leading-snug tracking-tight">
        <Link
          to={`/product/${product.slug}`}
          className="outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm"
        >
          {product.name}
        </Link>
      </h3>

      <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="truncate">{seller.name}</span>
        {seller.verified && (
          <BadgeCheck
            className="size-4 shrink-0 text-primary"
            aria-label="Verified seller"
          />
        )}
      </div>

      <div className="mt-2">
        <Stars rating={product.rating} count={product.reviews} />
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs">
        {outOfStock ? (
          <span className="text-destructive">Out of stock</span>
        ) : lowStock ? (
          <span className="inline-flex items-center gap-1 text-amber-400">
            <Timer className="size-3.5" /> Only {product.stock} left
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-emerald-400/90">
            <span className="size-1.5 rounded-full bg-emerald-400" /> In stock —
            {product.stock >= 999 ? " unlimited" : ` ${product.stock} available`}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <div>
          <p className="text-lg font-bold tracking-tight">
            {formatPrice(product.price)}
          </p>
          {product.oldPrice && (
            <p className="text-xs text-muted-foreground line-through">
              {formatPrice(product.oldPrice)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="clay"
            size="icon-sm"
            className="rounded-xl"
            disabled={outOfStock}
            aria-label={`Add ${product.name} to cart`}
            onClick={() =>
              add({
                slug: product.slug,
                name: product.name,
                price: product.price,
                hue: product.hue,
              })
            }
          >
            <ShoppingBag className="size-4" />
          </Button>
          <Button variant="clay" size="sm" className="rounded-xl" asChild>
            <Link to={`/product/${product.slug}`}>View</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="clay flex h-full flex-col p-5" aria-hidden="true">
      <Skeleton className="size-14 rounded-2xl" />
      <Skeleton className="mt-4 h-5 w-4/5" />
      <Skeleton className="mt-2 h-4 w-2/5" />
      <Skeleton className="mt-3 h-4 w-3/5" />
      <div className="mt-auto flex items-end justify-between pt-6">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-8 w-24 rounded-xl" />
      </div>
    </div>
  );
}
