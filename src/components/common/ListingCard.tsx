import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/site/BrandMark";
import type { PublicListing } from "@/lib/supabaseQueries";

interface ListingCardProps {
  listing: PublicListing;
  className?: string;
}

export function ListingCard({ listing, className }: ListingCardProps) {
  return (
    <article className={cn("group rounded-2xl border border-border/70 bg-card/80 p-4 transition-all hover:-translate-y-0.5 hover:border-amber-500/40", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl border border-border/70 bg-muted/40 overflow-hidden">
          <BrandMark brand={listing.brand} colored className="size-6" />
        </div>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {listing.serviceCategory ?? listing.brand}
        </span>
      </div>

      <div className="mt-3 min-w-0">
        <p className="truncate text-sm font-semibold leading-snug">{listing.title}</p>
        {listing.summary && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {listing.summary}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-lg font-bold tabular-nums">{listing.priceUsd}</span>
        {listing.discountPercent != null && listing.discountPercent > 0 && (
          <span className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
            -{listing.discountPercent}%
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {listing.stock === 0
            ? "Sold out"
            : listing.stock === 1
              ? "1 in stock"
              : `${listing.stock} in stock`}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {listing.status}
        </span>
      </div>
    </article>
  );
}
