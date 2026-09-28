import { getBrand } from "@/components/marketplace/icons";
import { cn } from "@/lib/utils";

/**
 * Renders an official social-platform glyph as an inline SVG. Pass `colored`
 * to use the platform's official brand color; otherwise the icon inherits
 * the current text color.
 */
export function BrandIcon({
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
      {entry.path ? (
        <path d={entry.path} />
      ) : (
        <circle cx="12" cy="12" r="9" />
      )}
    </svg>
  );
}
