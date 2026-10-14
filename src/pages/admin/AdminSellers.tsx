import { useState } from "react";
import {
  Shield,
  CheckCheck,
  XCircle,
  Search,
  Eye,
  Clock,
  AlertTriangle,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { useSession, type SessionUser } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

export default function AdminSellers() {
  const { user } = useSession();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [q, setQ] = useState("");

  const fetcher = async () => {
    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .eq("status", tab)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      ...r,
      platforms:
        typeof r.platforms === "string" && r.platforms
          ? (JSON.parse(r.platforms) as string[])
          : ([] as string[]),
    }));
  };

  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetcher>>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setRows(await fetcher());
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
            r.store_name.toLowerCase().includes(q.trim().toLowerCase()) ||
            r.slug.toLowerCase().includes(q.trim().toLowerCase())
        )
      : rows;

  return (
    <DashLayout title="Seller management" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Review and manage seller stores. Each applicant appears in the pending
          queue until you approve, reject, or request changes.
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
              placeholder="Search store name or slug"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button className="rounded-xl" onClick={loadOnce}>
            <Shield className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Could not load sellers: {error}
          </div>
        )}

        {isLoading ? (
          <EmptyState
            title="Loading stores…"
            description={`Fetching the ${tab} queue.`}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={q.trim() ? "No stores found" : `No ${tab} stores`}
            description={
              q.trim()
                ? "Try a different search term."
                : `There are no ${tab} stores to review right now.`
            }
          />
        ) : (
          <div className="glass overflow-hidden">
            <div className="border-border/70 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Store
            </div>
            <ul className="divide-y divide-border/60">
              {filtered.map((r) => (
                <li key={r.id} className="px-5 py-4 transition-colors hover:bg-accent/30">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 text-sm font-bold text-amber-950">
                      {r.store_name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.store_name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.slug} · {r.user_id.slice(0, 8)}…
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.logo_path && (
                        <span className="text-xs text-muted-foreground">
                          Logo
                        </span>
                      )}
                      {r.banner_path && (
                        <span className="text-xs text-muted-foreground">
                          Banner
                        </span>
                      )}
                      {r.platforms.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {(r.platforms?.[0] ?? "").charAt(0).toUpperCase() +
                            (r.platforms?.[0] ?? "").slice(1)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                      <Badge
                        variant="outline"
                        className={`rounded-full border-border/70 text-xs font-medium uppercase tracking-wide ${
                          tab === "approved"
                            ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                            : tab === "rejected"
                            ? "border-destructive/30 text-destructive"
                            : "border-amber-500/30 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {tab}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.review_note && (
                        <span className="rounded-lg bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                          Note
                        </span>
                      )}
                      <Button variant="ghost" size="sm" className="rounded-lg">
                        <Eye className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-lg">
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
