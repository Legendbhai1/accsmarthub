import { Link } from "react-router";
import { cn } from "@/lib/utils";

/**
 * The wordmark.
 *
 * The tile carries the brand ramp and a soft brand glow, and it tilts a couple
 * of degrees on hover; the "Mart" run of the wordmark is the same ramp clipped
 * to text. Both are pure CSS (see `.brand-gradient` and `.text-gradient`), so
 * they are neutralised automatically under `prefers-reduced-motion`.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("group flex items-center gap-2.5 outline-none", className)}
      aria-label="AccsMartHub home"
    >
      <span className="brand-gradient relative flex size-9 shrink-0 items-center justify-center rounded-xl shadow-lg shadow-primary/30 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/25"
        />
        <svg viewBox="0 0 24 24" className="size-4.5 text-primary-foreground" fill="currentColor" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H14a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 6V5.5ZM4 12a2.5 2.5 0 0 1 2.5-2.5H18a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 12.5V12ZM4 18.5A2.5 2.5 0 0 1 6.5 16H14a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 18.5Z" />
        </svg>
      </span>
      <span className="font-display text-lg font-extrabold tracking-tight text-foreground">
        Accs<span className="text-gradient">Mart</span>Hub
      </span>
    </Link>
  );
}
