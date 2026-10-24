import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Inbox, Minus, Plus } from "lucide-react";

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "border-success/25 bg-success/12 text-success",
    completed: "border-success/25 bg-success/12 text-success",
    paid: "border-success/25 bg-success/12 text-success",
    released: "border-success/25 bg-success/12 text-success",
    resolved: "border-success/25 bg-success/12 text-success",
    answered: "border-success/25 bg-success/12 text-success",
    in_escrow: "border-primary/25 bg-primary/10 text-primary",
    transferring: "border-warning/30 bg-warning/12 text-warning",
    pending: "border-warning/30 bg-warning/12 text-warning",
    under_review: "border-warning/30 bg-warning/12 text-warning",
    held: "border-warning/30 bg-warning/12 text-warning",
    requested: "border-warning/30 bg-warning/12 text-warning",
    open: "border-destructive/30 bg-destructive/12 text-destructive",
    disputed: "border-destructive/30 bg-destructive/12 text-destructive",
    suspended: "border-destructive/30 bg-destructive/12 text-destructive",
    rejected: "border-destructive/30 bg-destructive/12 text-destructive",
    approved: "border-info/30 bg-info/12 text-info",
    refunded: "border-border bg-muted text-muted-foreground",
    closed: "border-border bg-muted text-muted-foreground",
    paused: "border-border bg-muted text-muted-foreground",
    sold: "border-border bg-muted text-muted-foreground",
    cancelled: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-3 py-1 text-xs font-medium capitalize",
        styles[status] ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/**
 * Availability pill. Buyers care about two things: can I get one, and will it
 * run out — so sold-out and low-stock are called out explicitly.
 */
export function StockBadge({
  stock,
  className,
}: {
  stock: number;
  className?: string;
}) {
  const label =
    stock === 0 ? "Sold out" : stock <= 3 ? `Only ${stock} left` : `${stock} available`;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold",
        stock === 0
          ? "bg-muted text-muted-foreground"
          : stock <= 3
            ? "bg-warning/10 text-warning"
            : "bg-muted text-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Quantity stepper bounded by the listing's remaining stock. */
export function QuantityStepper({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const clamp = (n: number) => Math.min(Math.max(1, n), Math.max(1, max));
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={value <= 1}
        onClick={() => onChange(clamp(value - 1))}
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <Minus className="size-4" />
      </button>
      <span
        aria-live="polite"
        className="w-8 text-center text-sm font-bold tabular-nums"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="surface relative overflow-hidden p-5">
      {/* A brand hairline rather than a tinted card: the row of stats reads as
          one branded set without four saturated panels competing with the
          numbers. */}
      <span
        aria-hidden="true"
        className="brand-rule absolute inset-x-0 top-0 h-px opacity-70"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="brand-gradient flex size-9 shrink-0 items-center justify-center rounded-full">
          <Icon className="size-4 text-primary-foreground" />
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * A section title inside a page.
 *
 * Deliberately one step below `.page-title`: the page `h1` tops out at
 * `text-2xl`, so a section `h2` at `text-xl` always reads as subordinate.
 * These two used to be the same size, which left every page with a flat
 * heading hierarchy and no clear entry point.
 *
 * `level` exists for the pages that are *not* inside `DashShell` — the public
 * marketing pages (`/marketplace/categories`, `/disputes`) render their page
 * title through this component and had no `h1` in the document at all, which
 * left a screen reader with no page title to announce. Passing `level={1}`
 * emits the real `h1`; the default stays `h2` so a section heading inside a
 * dashboard page cannot become a second top-level heading.
 */
export function SectionHeading({
  title,
  subtitle,
  action,
  level = 2,
  accent,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** `1` renders an `h1` with the page-title scale; `2` (default) an `h2`. */
  level?: 1 | 2;
  /**
   * Optional two-stop override for the tick before the title, as CSS colour
   * values (e.g. `["var(--pop-cyan)", "var(--primary)"]`). Each home section
   * passes its own pair so a page of section heads reads as a spectrum rather
   * than as the same violet rule four times. Omit it and the rule falls back to
   * the brand ramp.
   */
  accent?: [string, string];
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        {/* A short brand-ramp tick before the title. It is the one piece of
            colour a section head carries, so the heading reads as part of the
            brand without a filled banner behind it. */}
        <span
          aria-hidden="true"
          className="brand-rule mb-2.5 block h-1 w-10 rounded-full"
          style={
            accent
              ? {
                  ["--rule-from" as string]: accent[0],
                  ["--rule-to" as string]: accent[1],
                }
              : undefined
          }
        />
        <Heading
          className={
            level === 1
              ? "page-title"
              : "font-display text-lg font-bold tracking-tight sm:text-xl"
          }
        >
          {title}
        </Heading>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  accent = "var(--primary)",
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** The hue the tile and the panel wash carry. Defaults to the brand. */
  accent?: string;
  /** The glyph. Defaults to an inbox, which is the generic "nothing here". */
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className="empty-panel flex flex-col items-center px-6 py-16 text-center"
      style={{ ["--pop" as string]: accent }}
    >
      {/* The tile, the glyph and the panel wash share one hue, so an empty
          state reads as a coloured zone rather than as an unbranded white box.
          They previously disagreed — a violet disc behind an amber icon —
          which read as a rendering fault rather than a style. */}
      <span
        className="icon-tile size-14"
        style={{ ["--tile" as string]: accent }}
      >
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-3xl border-border bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
                            destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
