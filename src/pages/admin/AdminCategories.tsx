import { useState } from "react";
import { Tag, Plus, Search, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { supabase } from "@/lib/supabase";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  created_at: string;
};

export default function AdminCategories() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, parent_id, created_at")
        .order("name");

      if (error) throw new Error(error.message);
      setRows(data ?? []);
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
      ? rows.filter((r) =>
          r.name.toLowerCase().includes(q.trim().toLowerCase()) ||
          r.slug.toLowerCase().includes(q.trim().toLowerCase())
        )
      : rows;

  const create = async (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const { error } = await supabase.from("categories").insert({
      name,
      slug,
    });
    if (error) throw new Error(error.message);
    loadOnce();
  };

  return (
    <DashLayout title="Categories" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Manage the marketplace categories. New categories are searchable
          immediately and can be nested under an existing parent.
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
          <NewCategoryForm onCreate={create} />
          <Button className="rounded-xl" onClick={loadOnce}>
            <Tag className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Could not load categories: {error}
          </div>
        )}

        {isLoading ? (
          <EmptyState
            title="Loading categories…"
            description="Fetching the category tree."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={q.trim() ? "No categories found" : "No categories yet"}
            description={
              q.trim()
                ? "Try a different search term."
                : "Add a category to organize listings."
            }
          />
        ) : (
          <div className="surface overflow-hidden">
            <div className="hidden grid-cols-[1fr_1fr_6rem_6rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Category</span>
              <span>Slug</span>
              <span className="text-right">Created</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-border/60">
              {filtered.map((r) => (
                <li
                  key={r.id}
                  className="px-6 py-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.id.slice(0, 8)}…
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {r.slug}
                    </span>
                    <span className="w-20 text-right text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex flex-col w-20 gap-1.5">
                      <Button variant="ghost" size="sm" className="rounded-lg">
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-lg text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
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

function NewCategoryForm({
  onCreate,
}: {
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onCreate(name.trim());
      setName("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create category");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        placeholder="New category name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-[180px]"
        disabled={busy}
      />
      <Button type="submit" className="rounded-xl" disabled={busy || !name.trim()}>
        <Plus className="size-4 mr-2" />
        Add
      </Button>
      {err && (
        <span className="text-xs text-destructive">{err}</span>
      )}
    </form>
  );
}
