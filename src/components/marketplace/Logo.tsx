import { Link } from "react-router";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("flex items-center gap-2.5 outline-none group", className)}
      aria-label="AccSmart home"
    >
      <span
        className="relative flex size-9 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105"
        style={{
          background:
            "linear-gradient(145deg, oklch(0.72 0.15 229), oklch(0.63 0.16 293))",
          boxShadow:
            "inset 0 2px 3px oklch(1 0 0 / 40%), inset 0 -3px 5px oklch(0.2 0.06 280 / 45%), 0 6px 14px -4px oklch(0.67 0.15 260 / 60%)",
        }}
      >
        <Zap className="size-4.5 fill-white text-white" aria-hidden="true" />
      </span>
      <span className="text-lg font-bold tracking-tight text-foreground">
        Acc
        <span className="text-gradient">Smart</span>
      </span>
    </Link>
  );
}
