import { formatPrice } from "@/lib/format";
import { Link } from "react-router";
import { BadgeCheck, Clock, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/site/BrandMark";
import { RatingStars } from "@/components/common/RatingStars";
import { getSeller, type Listing } from "@/lib/db";

export function ListingCard({ listing }: { listing: Listing }) {
  const seller = getSeller(listing.sellerId);
  const available = listing.status === "active" && listing.stock > 0;

  return (
    <article className="glass glass-hover flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl border border-border/70 bg-muted/40">
          <BrandMark brand={listing.brand} colored className="size-5.5" />
        </span>
        <div className="flex flex-col items-end gap-1.5">
          {listing.oldPrice && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
              Save {Math.round((1 - listing.price / listing.oldPrice) * 100)}%
            </span>
          )}
        </div>
      </div>

      <h3 className="mt-4 text-base font-semibold leading-snug tracking-tight">
        <Link
          to={`/listing/${listing.id}`}
          className="rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {listing.title}
        </Link>
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{listing.niche}</p>

      <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
        {listing.description}
      </p>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">{seller.name}</span>
        {seller.verified && (
          <BadgeCheck className="size-3.5 shrink-0 text-primary" aria-label="Verified seller" />
        )}
        <span className="ml-auto inline-flex items-center gap-1">
          <RatingStars rating={seller.rating} />
          <span className="tabular-nums">{seller.rating.toFixed(1)}</span>
        </span>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div>
          <p className="text-lg font-bold tracking-tight">{formatPrice(listing.price)}</p>
          <p className="text-xs text-muted-foreground">
            {available ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Available
              </span>
            ) : listing.status === "sold" ? (
              "Sold"
            ) : (
              "Unavailable"
            )}
          </p>
        </div>
        <Link
          to={`/listing/${listing.id}`}
          className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          View Details
        </Link>
      </div>
    </article>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="glass flex h-full flex-col p-5" aria-hidden="true">
      <Skeleton />
      <Skeleton className="mt-4 h-5 w-4/5" />
      <Skeleton className="mt-2 h-3 w-1/3" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-1.5 h-4 w-2/3" />
      <div className="mt-auto flex items-end justify-between pt-6">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export function TrustStrip() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        { icon: ShieldCheck, label: "Escrow on every order" },
        { icon: BadgeCheck, label: "ID-verified sellers" },
        { icon: Clock, label: "Transfers in under 24h" },
      ].map(({ icon: Icon, label }) => (
        <div key={label} className="glass flex items-center gap-2.5 px-4 py-3 text-sm">
          <Icon className="size-4 text-primary" />
          {label}
        </div>
      ))}
    </div>
  );
}
