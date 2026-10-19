import { useState } from "react";
import {
  Eye,
  Search,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { supabase } from "@/lib/supabase";

const TABS = [
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "paused", label: "Paused" },
] as const;

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
  const [tab, setTab] = useState<"active" | "pending" | "paused">("pending");
  const [q, setQ] = useState("");

  const [rows, setRows] = useState<ListingRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("listings")
        .select("id, title, brand, status, hidden, stock, price_usd, updated_at")
        .eq("status", tab)
        .order("updated_at", { ascending: false });

      if (error) throw new Error(error.message);
      setRows((data ?? []).map((r) => ({ ...r, stock: Number(r.stock ?? 0), price_usd: Number(r.price_usd ?? 0) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const loadOnce = () => {
    let ran = false;
    load().then(() => {
      if (!ran) ran = true;
    });
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
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
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
          <Button className="rounded-xl" onClick={loadOnce}>
            <Eye className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
            <div className="grid grid-cols-1 gap-4 border-b border-border/70 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-2 lg:grid-cols-[1fr_1fr_7rem_7rem_7rem_6rem]">
              <span>Listing</span>
              <span>Brand</span>
              <span className="text-right">Price</span>
              <span className="text-right">Stock</span>
              <span className="text-right">Status</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-border/60">
              {filtered.map((r) => (
                <li
                  key={r.id}
                  className="px-5 py-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.id.slice(0, 8)}…
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 hidden sm:block">
                      <span className="block truncate text-sm">{r.brand}</span>
                    </div>
                    <span className="w-20 text-right text-sm font-semibold tabular-nums">
                      ${r.price_usd.toFixed(2)}
                    </span>
                    <span className="w-20 text-right text-sm tabular-nums">
                      {r.stock}
                    </span>
                    <Badge
                      variant="outline"
                      className={`w-20 text-right text-xs font-medium uppercase tracking-wide ${
                        r.status === "active"
                          ? "border-success/30 text-success dark:text-success"
                          : r.status === "paused"
                          ? "border-destructive/30 text-destructive"
                          : "border-warning/30 text-warning"
                      }`}
                    >
                      {r.status}
                    </Badge>
                    <div className="flex flex-wrap w-20 justify-end gap-1.5">
                      <Button variant="ghost" size="sm" className="rounded-lg">
                        <MoreHorizontal className="size-3.5" />
                      </Button>
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
