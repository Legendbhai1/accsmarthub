import { useCallback, useEffect, useState } from "react";
import { Eye, Search, Pause, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { setListingStatus } from "@/lib/supabaseMutations";
import { toast } from "sonner";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** The moderation action a given listing status allows. */
function actionsFor(
  status: string,
): { label: string; next: string; icon: typeof CheckCircle2 }[] {
  if (status === "pending") {
    return [
      { label: "Approve", next: "active", icon: CheckCircle2 },
      { label: "Reject", next: "paused", icon: Pause },
    ];
  }
  if (status === "active") return [{ label: "Pause", next: "paused", icon: Pause }];
  if (status === "paused") return [{ label: "Re-approve", next: "active", icon: RotateCcw }];
  return [];
}

type ListingRow = {
  id: string;
  title: string;
  brand: string;
  status: string;
  hidden: boolean;
  stock: number;
  price_usd: number;
  updated_at: string;
};

export default function AdminListings() {
  const [tab, setTab] = useState<TabKey>("pending");
  const [q, setQ] = useState("");

  const [rows, setRows] = useState<ListingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // A promise chain, not an async function: the effect below must not call
  // setState synchronously, or React reports a cascading render. Loading state
  // is flipped from the event handlers that start a fresh load.
  const load = useCallback(() => {
    return Promise.resolve(
      supabase
        .from("listings")
        .select("id, title, brand, status, hidden, stock, price_usd, updated_at")
        .eq("status", tab)
        .order("updated_at", { ascending: false }),
    )
      .then(({ data, error: fetchError }) => {
        if (fetchError) throw new Error(fetchError.message);
        setRows(
          (data ?? []).map((r) => ({
            ...r,
            stock: Number(r.stock ?? 0),
            price_usd: Number(r.price_usd ?? 0),
          })),
        );
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Unknown error"),
      )
      .finally(() => setIsLoading(false));
  }, [tab]);

  // Load on mount and whenever the tab changes. The previous version only
  // fetched from the Refresh button, so the queue looked empty until a manual
  // click.
  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    setIsLoading(true);
    void load();
  };

  const selectTab = (next: TabKey) => {
    setIsLoading(true);
    setTab(next);
  };

  const moderate = async (row: ListingRow, next: string) => {
    setBusyId(row.id);
    try {
      await setListingStatus({ listingId: row.id, status: next });
      toast.success(
        next === "active" ? "Listing approved" : next === "paused" ? "Listing paused" : "Listing updated",
        { description: row.title },
      );
      await load();
    } catch (err) {
      toast.error("Could not update the listing", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const filtered =
    q.trim()
      ? rows.filter(
          (r) =>
            r.title.toLowerCase().includes(q.trim().toLowerCase()) ||
            r.brand.toLowerCase().includes(q.trim().toLowerCase())
        )
      : rows;

  return (
    <DashLayout title="Listing moderation" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Approve or pause listings. Listing status and visibility both feed into
          what shoppers can see on the marketplace.
        </p>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by title or brand"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button className="rounded-xl" onClick={refresh} disabled={isLoading}>
            <Eye className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Could not load listings: {error}
          </div>
        )}

        {isLoading ? (
          <EmptyState
            title="Loading listings…"
            description={`Fetching the ${tab} queue.`}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={q.trim() ? "No listings found" : `No ${tab} listings`}
            description={
              q.trim()
                ? "Try a different search term."
                : `There are no ${tab} listings to review right now.`
            }
          />
        ) : (
          <div className="surface overflow-hidden">
            <ul className="divide-y divide-border/60">
              {filtered.map((r) => (
                <li
                  key={r.id}
                  className="px-5 py-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.title}
                      </span>
                      <span className="block text-xs capitalize text-muted-foreground">
                        {r.brand} · {r.id.slice(0, 8)}…
                      </span>
                    </div>
                    <span className="w-24 text-right text-sm font-semibold tabular-nums">
                      {formatPrice(r.price_usd)}
                    </span>
                    <span className="w-20 text-right text-sm tabular-nums">
                      {r.stock}
                    </span>
                    <Badge
                      variant="outline"
                      className={`w-20 justify-center text-xs font-medium uppercase tracking-wide ${
                        r.status === "active"
                          ? "border border-success/30 text-success"
                          : r.status === "paused"
                          ? "border border-destructive/30 text-destructive"
                          : "border border-warning/30 text-warning"
                      }`}
                    >
                      {r.status}
                    </Badge>
                    {/* Real moderation actions, wired to set_listing_status().
                        The old markup was a dead "more" icon that did nothing. */}
                    <div className="flex w-44 justify-end gap-1.5">
                      {actionsFor(r.status).map(({ label, next, icon: Icon }) => (
                        <Button
                          key={next}
                          type="button"
                          variant={next === "active" ? "default" : "outline"}
                          size="sm"
                          className="rounded-lg"
                          disabled={busyId === r.id}
                          onClick={() => void moderate(r, next)}
                        >
                          <Icon className="size-3.5 mr-1.5" />
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DashLayout>
  );
}
