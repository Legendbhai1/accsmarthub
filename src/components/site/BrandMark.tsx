import { getBrand } from "@/lib/brands";
import { cn } from "@/lib/utils";

/** Official platform glyph rendered as inline SVG, optionally in brand color. */
export function BrandMark({
  brand,
  className,
  colored,
}: {
  brand: string;
  className?: string;
  colored?: boolean;
}) {
  const entry = getBrand(brand);
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={entry.title}
      className={cn("shrink-0", className)}
      style={colored ? { color: `#${entry.hex}` } : undefined}
      fill="currentColor"
    >
      {entry.path ? <path d={entry.path} /> : <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}
