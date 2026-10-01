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
import { Inbox } from "lucide-react";

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
