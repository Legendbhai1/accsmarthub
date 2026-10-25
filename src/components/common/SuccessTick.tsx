import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * The tick that draws itself when a purchase actually lands.
 *
 * The order-confirmed Lottie is a whole illustrated scene — a bag, leaves and
 * two lines of baked-in text — which is right for the confirmation *page* but
 * too soft and too slow to read as "your payment went through" at the moment
 * the buyer clicks Fund escrow. This is the crisp version: a filled disc with
 * a single check stroke that draws, so the feedback is unambiguous at a glance.
 *
 * It is an SVG stroke rather than another bundled Lottie because the mark has
 * to be legible at 40px in a toast-sized overlay, where the Lottie's own text
 * layers are unreadable, and because a path `stroke-dashoffset` is the one
 * animation the browser can run without another 100KB payload.
 *
 * Same contract as `LottieAnimation`: it is a *success signal*, so a caller may
 * only mount it once the server has agreed. It carries `role="img"` and a real
 * label, and under `prefers-reduced-motion` the draw is skipped and the tick is
 * shown finished — the outcome is information, so it stays.
 */
export function SuccessTick({
  size = 96,
  className,
  label = "Payment successful",
  tone = "success",
}: {
  size?: number;
  className?: string;
  label?: string;
  /**
   * `success` is the green "the money moved" mark; `brand` is the same tick in
   * the brand ramp, for a non-payment success that should still read as ours.
   */
  tone?: "success" | "brand";
}) {
  const reduced = useReducedMotion();
  const disc = tone === "brand" ? "var(--brand-2)" : "var(--success)";

  return (
    <span
      role="img"
      aria-label={label}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size, maxWidth: "100%" }}
    >
      {/* The ring that expands once, behind the disc, so the tick lands rather
          than simply appearing. Purely decorative, and dropped entirely under
          reduced motion — it is motion with no information in it. */}
      {!reduced && (
        <span
          aria-hidden="true"
          className="animate-tick-ring absolute inset-0 rounded-full"
          style={{ background: `hsl(${disc} / 0.35)` }}
        />
      )}
      <svg
        viewBox="0 0 52 52"
        className={cn("relative size-full", !reduced && "animate-tick-pop")}
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="26" cy="26" r="24" fill={`hsl(${disc})`} />
        <path
          d="M15 27.5 L22.5 35 L37 18.5"
          fill="none"
          stroke="hsl(var(--primary-foreground))"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("tick-check", reduced && "tick-check-static")}
        />
      </svg>
    </span>
  );
}
