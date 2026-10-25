import { useCallback, useEffect, useState } from "react";
import { Search, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/Primitives";
import { supabase } from "@/lib/supabase";

type AuditRow = {
  id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_text: string | null;
  note: string | null;
  created_at: string;
};

/**
 * `admin_audit` is created by two migrations with different column names
 * (0007: admin_id/target/detail, 0012: actor_id/resource_type/...). Read the
 * row as-is and normalise, so the page works against either shape instead of
 * needing a service-role key in the browser.
 */
type RawAuditRow = {
  id: string;
  action: string;
  created_at: string;
  actor_id?: string | null;
  admin_id?: string | null;
  resource_type?: string | null;
  target?: string | null;
  resource_id?: string | null;
  resource_text?: string | null;
  detail?: string | null;
  note?: string | null;
};

function normaliseRow(r: RawAuditRow): AuditRow {
  return {
    id: r.id,
    actor_id: r.actor_id ?? r.admin_id ?? "",
    action: r.action,
    resource_type: r.resource_type ?? "general",
    resource_id: r.resource_id ?? null,
    resource_text: r.resource_text ?? r.target ?? null,
    note: r.note ?? r.detail ?? null,
    created_at: r.created_at,
  };
}

export default function AdminAudit() {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AuditRow[]>([]);
  // Starts true: the mount effect is always the first load.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // RLS on admin_audit only lets admins read, so the normal publishable-key
  // client is enough — no service-role key belongs in the browser.
  const load = useCallback(() => {
    return Promise.resolve(
      supabase
        .from("admin_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    )
      .then(({ data, error: fetchError }) => {
        if (fetchError) throw new Error(fetchError.message);
        setRows(((data ?? []) as RawAuditRow[]).map(normaliseRow));
        setError(null);
      })
      .catch((err: unknown) => {
        // Keep any rows already displayed; a failed refresh is an error, not an
        // empty audit log.
        setError(err instanceof Error ? err.message : "Could not load audit log.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered =
    search.trim()
      ? rows.filter(
          (r) =>
            r.action.toLowerCase().includes(search.trim().toLowerCase()) ||
            r.resource_type.toLowerCase().includes(search.trim().toLowerCase()) ||
            r.resource_text?.toLowerCase().includes(search.trim().toLowerCase()),
        )
      : rows;

  return (
    <>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Review privileged actions and moderation decisions. Every sensitive
          change leaves a trail here so admin work stays traceable.
        </p>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search action, resource, or note"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button className="rounded-xl" onClick={() => void load()} disabled={loading}>
            <Shield className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Could not load audit log: {error}
          </div>
        )}

        {loading && rows.length === 0 ? (
          <EmptyState
            title="Loading audit log…"
            description="Fetching recent privileged actions."
          />
        ) : rows.length === 0 && error ? (
          <EmptyState
            title="Audit log could not be loaded"
            description="Use Refresh to try again."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search.trim() ? "No audit entries found" : "No audit entries yet"}
            description={
              search.trim()
                ? "Try a different search term."
                : "Privileged actions will appear here once the platform records them."
            }
          />
        ) : (
          <div className="surface overflow-hidden">
            <div className="hidden grid-cols-[1fr_7rem_8rem_6rem_6rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Audit entry</span>
              <span>Action</span>
              <span className="text-right">Resource</span>
              <span className="text-right">By</span>
              <span className="text-right">When</span>
            </div>
            <ul className="divide-y divide-border/60">
              {filtered.map((r) => (
                <li
                  key={r.id}
                  className="px-6 py-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.action}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.resource_type}
                        {r.resource_text ? ` — ${r.resource_text}` : ""}
                      </span>
                      {r.note && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {r.note}
                        </span>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-lg border-border/70 text-xs font-medium uppercase tracking-wide"
                    >
                      {r.action}
                    </Badge>
                    <span className="w-24 text-right text-xs text-muted-foreground truncate">
                      {r.resource_text ? r.resource_text.slice(0, 22) : r.resource_id?.slice(0, 22) ?? "—"}
                    </span>
                    <span className="w-20 text-right text-xs text-muted-foreground truncate">
                      {r.actor_id ? `${r.actor_id.slice(0, 8)}…` : "—"}
                    </span>
                    <span className="w-20 text-right text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
