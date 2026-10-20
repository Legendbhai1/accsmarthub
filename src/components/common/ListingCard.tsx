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
  const discounted =
    listing.discountPercent != null && listing.discountPercent > 0;

  return (
    <article
      className={cn(
        "group surface card-hover relative flex flex-col overflow-hidden p-3",
        className,
      )}
    >
      {/* The brand hairline only appears on hover, so a grid of cards stays
          calm until the pointer is on one of them. */}
      <span
        aria-hidden="true"
        className="brand-rule absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
      <Link to={`/marketplace/${listing.id}`} className="flex flex-1 flex-col">
        <div className="relative">
          <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-secondary to-accent">
            {listing.imagePath ? (
              <img
                src={publicAssetUrl("listing-assets", listing.imagePath)}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            ) : (
              // A listing with no uploaded image still needs a card that is
              // not an empty grey rectangle, so the platform mark stands in.
              <BrandMark
                brand={listing.brand}
                block
                className="size-12 shadow-lg transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
              />
            )}
          </div>
          {soldOut ? (
            <span className="absolute left-2 top-2 rounded-md bg-foreground/90 px-2 py-0.5 text-[10px] font-bold text-background">
              Sold out
            </span>
          ) : (
            discounted && (
              <span className="brand-gradient absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-md">
                −{listing.discountPercent}%
              </span>
            )
          )}
        </div>

        <div className="mt-3 min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover:text-primary">
            {listing.title}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {listing.serviceCategory ?? listing.brand}
            {listing.warrantyHours != null && listing.warrantyHours > 0
              ? ` · ${listing.warrantyHours}h warranty`
              : ""}
          </p>
        </div>

        <div className="mt-2.5 flex items-baseline gap-1.5 border-t border-border/60 pt-2.5">
          <span className="text-base font-extrabold tabular-nums text-foreground">
            {formatPrice(listing.priceUsd)}
          </span>
          <span
            className={cn(
              "ml-auto text-[11px] font-semibold",
              soldOut ? "text-muted-foreground" : "text-success",
            )}
          >
            {soldOut ? "Unavailable" : `${listing.stock} in stock`}
          </span>
        </div>
      </Link>
    </article>
  );
}
