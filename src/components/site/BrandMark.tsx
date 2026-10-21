import { getBrand, isMonochromeBrand } from "@/lib/brands";
import { cn } from "@/lib/utils";

/** Official platform glyph rendered as inline SVG, optionally in brand color. */
export function BrandMark({
  brand,
  className,
  colored,
  block,
}: {
  brand: string;
  className?: string;
  colored?: boolean;
  /** Render as a rounded app-icon tile filled with the brand color. */
  block?: boolean;
}) {
  const entry = getBrand(brand);
  // TikTok and X are pure black. Painting that literally leaves a black tile on
  // the dark canvas, so those two use the theme's ink instead and invert with
  // it. See `isMonochromeBrand`.
  const monochrome = isMonochromeBrand(entry.hex);

  if (block) {
    return (
      <span
        role="img"
        aria-label={entry.title}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl shadow-sm",
          monochrome && "bg-foreground",
          className,
        )}
        style={monochrome ? undefined : { background: `#${entry.hex}` }}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={cn(
            "size-[58%]",
            monochrome ? "text-background" : "text-white",
          )}
          fill="currentColor"
        >
          {entry.path ? <path d={entry.path} /> : <circle cx="12" cy="12" r="9" />}
        </svg>
      </span>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={entry.title}
      className={cn(
        "shrink-0",
        // An uncoloured glyph is drawn in `currentColor`, which in dark mode is
        // near-white — so a black brand glyph already reads. It is only the
        // *coloured* form that has to fall back to the ink token.
        colored && monochrome && "text-foreground",
        className,
      )}
      style={colored && !monochrome ? { color: `#${entry.hex}` } : undefined}
      fill="currentColor"
    >
      {entry.path ? <path d={entry.path} /> : <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}
