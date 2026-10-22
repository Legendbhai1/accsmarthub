import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Shield, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { DISPUTE_REASONS, DISPUTE_REASON_LABELS } from "@/lib/disputeReasons";
import { TELEGRAM_CHANNEL, TELEGRAM_SUPPORT } from "@/lib/contact";
import { supabase } from "@/lib/supabase";

/**
 * A value the platform actually runs on, read from the place that owns it.
 *
 * `source` is where the number is enforced, so an admin can see that the fee
 * is a database constant and not a toggle this page can flip.
 */
type ConfigRow = {
  label: string;
  value: string;
  detail: string;
  source: string;
};

const TRADE_CONFIG: ConfigRow[] = [
  {
    label: "Platform commission",
    value: "10%",
    detail: "Deducted from the seller's gross at checkout.",
    source: "place_order()",
  },
  {
    label: "Payment-protection fee",
    value: "3%",
    detail: "Added to the buyer's total on top of the listing price.",
    source: "place_order()",
  },
  {
    label: "Inspection window",
    value: "14 days",
    detail: "How long a buyer has to confirm or dispute a delivered order.",
    source: "orders.inspection_deadline",
  },
  {
    label: "Seller withdrawal",
    value: "$10 minimum · 1% fee",
    detail: "Paid from sale proceeds (the earned pool).",
    source: "request_payout()",
  },
  {
    label: "Buyer withdrawal",
    value: "$20 minimum · 1.5% fee",
    detail: "Paid from deposited funds (the spendable pool).",
    source: "request_payout()",
  },
  {
    label: "New listing status",
    value: "Pending review",
    detail: "Every new listing waits for admin approval before it is sellable.",
    source: "listings insert policy",
  },
];

export default function AdminSettings() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queues, setQueues] = useState<{
    pendingListings: number;
    pendingStores: number;
    openDisputes: number;
    openReports: number;
  } | null>(null);

  // A promise chain, not an async function: the mount effect below must not
  // call setState synchronously, or React reports a cascading render. The
  // loading flag is flipped from the handlers that start a fresh read.
  const load = useCallback(() => {
    return Promise.all([
      supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "under_review"]),
      supabase
        .from("off_platform_reports")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "reviewing"]),
    ])
      .then(([listings, stores, disputes, reports]) => {
        const failure = [listings, stores, disputes, reports].find((r) => r.error);
        if (failure?.error) throw new Error(failure.error.message);
        setQueues({
          pendingListings: listings.count ?? 0,
          pendingStores: stores.count ?? 0,
          openDisputes: disputes.count ?? 0,
          openReports: reports.count ?? 0,
        });
        setError(null);
      })
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Could not read configuration.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  // Read the queues on mount. The disposable-domain blocklist is deliberately
  // *not* counted here: that table is server-only (RLS on, no policies, no
  // grants), so a browser read would fail rather than report a number.
  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    setLoading(true);
    void load();
  };

  return (
    <DashLayout title="Settings" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          The values the platform is currently running on. Each one is enforced
          by a database function or column, so this page reports the live
          configuration rather than offering a switch that would not change it.
          Changing any of these means a migration and a deploy.
        </p>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            className="rounded-xl"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {TRADE_CONFIG.map((row) => (
            <div
              key={row.label}
              className="rounded-2xl border border-border/70 bg-card p-5 text-card-foreground shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{row.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
                </div>
                <span className="shrink-0 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground">
                  {row.value}
                </span>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Lock className="size-3" />
                {row.source}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 text-card-foreground shadow-sm">
          <h3 className="text-sm font-medium">Review queues</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Work waiting on an admin decision right now. Counted from the same
            rows the moderation pages act on.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Listings", value: queues?.pendingListings },
              { label: "Stores", value: queues?.pendingStores },
              { label: "Disputes", value: queues?.openDisputes },
              { label: "Reports", value: queues?.openReports },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5"
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums">
                  {value === undefined ? "—" : value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 text-card-foreground shadow-sm">
          <h3 className="text-sm font-medium">Dispute reasons</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The canonical vocabulary buyers can pick from. These strings are
            constrained by the database, so the UI and the server agree.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DISPUTE_REASONS.map((reason) => (
              <span
                key={reason}
                className="rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 text-xs"
              >
                {DISPUTE_REASON_LABELS[reason]}
                <span className="ml-1.5 text-muted-foreground">{reason}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 text-card-foreground shadow-sm">
          <h3 className="text-sm font-medium">Support channels</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Where members can reach the team outside the app.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{TELEGRAM_CHANNEL.label}</span>
              <a
                className="font-medium underline-offset-2 hover:underline"
                href={TELEGRAM_CHANNEL.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {TELEGRAM_CHANNEL.handle}
              </a>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{TELEGRAM_SUPPORT.label}</span>
              <a
                className="font-medium underline-offset-2 hover:underline"
                href={TELEGRAM_SUPPORT.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {TELEGRAM_SUPPORT.handle}
              </a>
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 text-card-foreground shadow-sm">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 size-5 text-warning" />
            <div>
              <h3 className="text-sm font-medium">Why there is no save button</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Fees, withdrawal floors and the inspection window are enforced in
                Postgres, not in a settings row. A toggle here would look like it
                changed the platform while the database kept charging the old
                rate. These are edited by migration, reviewed like any other
                change to money handling. Moderation actions taken elsewhere in
                the console are recorded in the audit log.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashLayout>
  );
}
