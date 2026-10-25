import { useCallback, useEffect, useState } from "react";
import { Tag, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/Primitives";
import { BrandMark } from "@/components/site/BrandMark";
import { supabase } from "@/lib/supabase";
import { categories } from "@/lib/db";

type Counts = { active: number; pending: number; total: number };

export default function AdminCategories() {
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Promise chain rather than an async function: the mount effect must not
  // call setState synchronously, or React reports a cascading render.
  const load = useCallback(() => {
    return Promise.resolve(supabase.from("listings").select("brand, status"))
      .then(({ data, error: fetchError }) => {
        if (fetchError) throw new Error(fetchError.message);

        const next: Record<string, Counts> = {};
        for (const row of data ?? []) {
          const brand = row.brand as string;
          const bucket = (next[brand] ??= { active: 0, pending: 0, total: 0 });
          bucket.total += 1;
          if (row.status === "active") bucket.active += 1;
          if (row.status === "pending") bucket.pending += 1;
        }
        setCounts(next);
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Unknown error"),
      )
      .finally(() => setIsLoading(false));
  }, []);

  // Load on mount; the previous version only fetched from the Refresh button.
  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    setIsLoading(true);
    void load();
  };

  const filtered = q.trim()
    ? categories.filter(
        (c) =>
          c.name.toLowerCase().includes(q.trim().toLowerCase()) ||
          c.slug.toLowerCase().includes(q.trim().toLowerCase()),
      )
    : categories;

  return (
    <>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          The platform directory. Categories are the ecosystems a listing can
          belong to; the counts below are live listings per category, so an
          empty one shows a storefront gap rather than a made-up total.
        </p>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search categories"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button className="rounded-xl" onClick={refresh} disabled={isLoading}>
            <Tag className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Could not load categories: {error}
          </div>
        )}

        {isLoading ? (
          <EmptyState title="Loading categories…" description="Counting live listings." />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No categories found"
            description="Try a different search term."
          />
        ) : (
          <div className="surface overflow-hidden">
            <ul className="divide-y divide-border/60">
              {filtered.map((c) => {
                const stat = counts[c.brand] ?? { active: 0, pending: 0, total: 0 };
                return (
                  <li
                    key={c.slug}
                    className="flex flex-wrap items-center gap-3 px-6 py-4 transition-colors hover:bg-accent/30"
                  >
                    <BrandMark brand={c.brand} block className="size-9 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">{c.slug}</span>
                    </div>
                    <span className="w-24 text-right text-sm tabular-nums">
                      <span className="font-semibold text-success">{stat.active}</span>
                      <span className="text-xs text-muted-foreground"> live</span>
                    </span>
                    <span className="w-24 text-right text-sm tabular-nums text-warning">
                      {stat.pending}
                      <span className="text-xs text-muted-foreground"> pending</span>
                    </span>
                    <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                      {stat.total} total
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
