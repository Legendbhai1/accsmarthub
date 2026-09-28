import { createElement } from "react";
import { cn } from "@/lib/utils";
import { getCatalogIcon } from "@/components/marketplace/icons";

/**
 * Generated clay-style artwork for demo products. Each product gets a soft
 * gradient plate in its category hue with a matching icon — no stock imagery
 * needed, and every tile looks intentional.
 */
export function ProductArtwork({
  icon,
  hue,
  size = "md",
  className,
}: {
  icon: string;
  hue: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const iconComponent = getCatalogIcon(icon);
  const dims =
    size === "sm" ? "size-10 rounded-xl" : size === "lg" ? "size-20 rounded-3xl" : "size-14 rounded-2xl";
  const iconSize = size === "sm" ? 18 : size === "lg" ? 34 : 24;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden",
        dims,
        className,
      )}
      style={{
        background: `linear-gradient(145deg, oklch(0.75 0.12 ${hue} / 90%), oklch(0.5 0.17 ${hue + 25} / 92%))`,
        boxShadow: `inset 0 2px 4px oklch(1 0 0 / 35%), inset 0 -4px 8px oklch(0.25 0.08 ${hue + 20} / 40%), 0 8px 18px -6px oklch(0.55 0.15 ${hue} / 45%)`,
      }}
      aria-hidden="true"
    >
      {/* soft sheen */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(80% 60% at 25% 18%, oklch(1 0 0 / 30%), transparent 60%)`,
        }}
      />
      {createElement(iconComponent, {
        className: "relative text-white drop-shadow-sm",
        size: iconSize,
        strokeWidth: 1.9,
      })}
    </div>
  );
}
