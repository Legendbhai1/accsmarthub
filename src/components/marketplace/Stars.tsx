import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stars({
  rating,
  count,
  className,
}: {
  rating: number;
  count?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label={`Rated ${rating} out of 5${count ? ` from ${count} reviews` : ""}`}
    >
      <span className="relative inline-flex" aria-hidden="true">
        <span className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="size-3.5 text-muted-foreground/40" />
          ))}
        </span>
        <span
          className="absolute inset-0 flex gap-0.5 overflow-hidden"
          style={{ width: `${(rating / 5) * 100}%` }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
            />
          ))}
        </span>
      </span>
      <span className="text-xs font-medium text-muted-foreground">
        {rating.toFixed(1)}
        {count !== undefined && ` (${count})`}
      </span>
    </span>
  );
}
