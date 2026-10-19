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
    active: "bg-success/10 text-success",
    completed: "bg-success/10 text-success",
    paid: "bg-success/10 text-success",
    released: "bg-success/10 text-success",
    resolved: "bg-success/10 text-success",
    answered: "bg-success/10 text-success",
    in_escrow: "bg-muted text-foreground",
    transferring: "bg-warning/10 text-warning",
    pending: "bg-warning/10 text-warning",
    under_review: "bg-warning/10 text-warning",
    held: "bg-warning/10 text-warning",
    open: "bg-destructive/10 text-destructive",
    disputed: "bg-destructive/10 text-destructive",
    suspended: "bg-destructive/10 text-destructive",
    refunded: "bg-muted text-muted-foreground",
    closed: "bg-muted text-muted-foreground",
    paused: "bg-muted text-muted-foreground",
    sold: "bg-muted text-muted-foreground",
    requested: "bg-warning/10 text-warning",
    approved: "bg-info/10 text-info",
    rejected: "bg-destructive/10 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium capitalize",
        styles[status] ?? "bg-muted text-muted-foreground",
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
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
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
    <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/70 p-1 backdrop-blur-xl">
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
    <div className="surface p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary">
          <Icon className="size-4 text-primary-foreground" />
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
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
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10">
        <Inbox className="size-5 text-warning" />
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
          <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              "rounded-full",
              destructive
                ? "bg-destructive text-white hover:bg-destructive/90"
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
