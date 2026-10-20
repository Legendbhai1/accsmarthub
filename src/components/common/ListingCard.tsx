import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { BrandMark } from "@/components/site/BrandMark";
import { publicAssetUrl } from "@/lib/supabaseMutations";
import type { PublicListing } from "@/lib/supabaseQueries";

interface ListingCardProps {
  listing: PublicListing;
  className?: string;
}

/**
 * The compact listing card used on the homepage and in the "more from this
 * seller" strip.
 *
 * Two bugs are fixed here:
 *   * the price was rendered as `{listing.priceUsd}`, so a listing showed
 *     "129.5" instead of "$129.50" — it now goes through `formatPrice`, the
 *     same helper the marketplace grid uses;
 *   * the card was not a link at all, so it looked interactive and did
 *     nothing. It now points at the canonical `/marketplace/:id` route, the
 *     same one the marketplace grid uses.
 */
export function ListingCard({ listing, className }: ListingCardProps) {
  const soldOut = listing.stock === 0;

  return (
    <article
      className={cn(
        "group rounded-2xl border border-border/70 bg-card p-3 transition-colors hover:border-primary/40",
        className,
      )}
    >
      <Link to={`/marketplace/${listing.id}`} className="block">
        <div className="relative">
          <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-muted">
            {listing.imagePath ? (
              <img
                src={publicAssetUrl("listing-assets", listing.imagePath)}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              // A listing with no uploaded image still needs a card that is
              // not an empty grey rectangle, so the platform mark stands in.
              <BrandMark
                brand={listing.brand}
                block
                className="size-10 transition-transform duration-200 group-hover:scale-105"
              />
            )}
          </div>
          {soldOut && (
            <span className="absolute left-2 top-2 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-bold text-foreground">
              Sold out
            </span>
          )}
        </div>

        <div className="mt-2.5 min-w-0">
          <p className="truncate text-sm font-semibold leading-snug">
            {listing.title}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {listing.serviceCategory ?? listing.brand}
            {listing.warrantyHours != null && listing.warrantyHours > 0
              ? ` · ${listing.warrantyHours}h warranty`
              : ""}
          </p>
        </div>

        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-base font-bold tabular-nums">
            {formatPrice(listing.priceUsd)}
          </span>
          {listing.discountPercent != null && listing.discountPercent > 0 && (
            <span className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
              -{listing.discountPercent}%
            </span>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {soldOut ? "Unavailable" : `${listing.stock} in stock`}
          </span>
        </div>
      </Link>
    </article>
  );
}
