import { BrandIcon } from "@/components/marketplace/BrandIcon";
import { cn } from "@/lib/utils";

/**
 * Clean, professional artwork tile: a neutral surface with the platform's
 * official mark in its brand color. Used on cards, the product gallery,
 * cart lines and checkout.
 */
export function ProductArtwork({
  brand,
  size = "md",
  className,
}: {
  brand: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims =
    size === "sm"
      ? "size-10 rounded-xl"
      : size === "lg"
        ? "size-20 rounded-2xl"
        : "size-14 rounded-xl";
  const iconSize =
    size === "sm" ? "size-5" : size === "lg" ? "size-10" : "size-7";

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center border border-border/70 bg-muted/40",
        dims,
        className,
      )}
      aria-hidden="true"
    >
      <BrandIcon brand={brand} colored className={iconSize} />
    </div>
  );
}
