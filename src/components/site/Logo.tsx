import { Link } from "react-router";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("group flex items-center gap-2.5 outline-none", className)}
      aria-label="AccsMartHub home"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 shadow-[0_10px_24px_-14px_rgba(180,120,20,0.9)] transition-transform duration-200 group-hover:scale-105">
        <svg viewBox="0 0 24 24" className="size-4.5 text-amber-950" fill="currentColor" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H14a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 6V5.5ZM4 12a2.5 2.5 0 0 1 2.5-2.5H18a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 12.5V12ZM4 18.5A2.5 2.5 0 0 1 6.5 16H14a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 18.5Z" />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight text-foreground">
        Accs<span className="text-gradient">Mart</span>Hub
      </span>
    </Link>
  );
}