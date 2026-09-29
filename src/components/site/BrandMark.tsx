import { getBrand } from "@/lib/brands";
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

  if (block) {
    return (
      <span
        role="img"
        aria-label={entry.title}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl shadow-sm",
          className,
        )}
        style={{ background: `#${entry.hex}` }}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-[58%] text-white"
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
      className={cn("shrink-0", className)}
      style={colored ? { color: `#${entry.hex}` } : undefined}
      fill="currentColor"
    >
      {entry.path ? <path d={entry.path} /> : <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}
