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
    active: "bg-emerald-500/10 text-emerald-600",
    completed: "bg-emerald-500/10 text-emerald-600",
    paid: "bg-emerald-500/10 text-emerald-600",
    released: "bg-emerald-500/10 text-emerald-600",
    resolved: "bg-emerald-500/10 text-emerald-600",
    answered: "bg-emerald-500/10 text-emerald-600",
    in_escrow: "bg-muted text-foreground",
    transferring: "bg-amber-500/10 text-amber-600",
    pending: "bg-amber-500/10 text-amber-600",
    under_review: "bg-amber-500/10 text-amber-600",
    held: "bg-amber-500/10 text-amber-600",
    open: "bg-red-500/10 text-red-600",
    disputed: "bg-red-500/10 text-red-600",
    suspended: "bg-red-500/10 text-red-600",
    refunded: "bg-slate-500/10 text-slate-600",
    closed: "bg-muted text-muted-foreground",
    paused: "bg-muted text-muted-foreground",
    sold: "bg-muted text-muted-foreground",
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
            ? "bg-amber-500/10 text-amber-700"
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
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-white p-1">
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
    <div className="rounded-3xl border border-border bg-white p-5 shadow-[0_1px_2px_rgba(21,23,43,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#15172b]">
          <Icon className="size-4 text-white" />
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
    <div className="flex flex-col items-center rounded-3xl border border-border bg-white px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-5 text-muted-foreground" />
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
      <AlertDialogContent className="rounded-3xl border-border bg-white">
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
                : "bg-[#15172b] text-white hover:bg-[#15172b]/90",
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
