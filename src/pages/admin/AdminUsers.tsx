import { useCallback, useEffect, useRef, useState } from "react";
import { UserX, Shield, Mail, CheckCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/Primitives";
import { supabase } from "@/lib/supabase";
import { adminSetAdmin } from "@/lib/supabaseMutations";
import { toast } from "sonner";

type AdminUserRow = {
  id: string;
  email: string | null;
  name: string | null;
  last_sign_in_at: string | null;
  role: string | null;
};

type AdminUsersPayload = {
  users: AdminUserRow[];
  total: number;
  page: number;
  per_page: number;
};

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

/** Turn a FunctionsHttpError (or anything else) into a readable message. */
async function describeFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = (await ctx.json()) as { error?: unknown };
      if (typeof body?.error === "string" && body.error) return body.error;
    } catch {
      // Non-JSON error body: fall through to the generic message.
    }
    if (ctx.status === 401) return "Your session expired. Sign in again.";
    if (ctx.status === 403) return "Your account does not have admin access.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not load users.";
}

function AdminUsersError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {message}
      <div className="mt-2">
        <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={retry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Monotonic request id: only the newest response may touch state, so a slow
  // earlier request can never overwrite a newer one.
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    (nextPage: number, nextRole: string, nextSearch: string) => {
      const requestId = ++requestRef.current;
      return Promise.resolve(
        supabase.functions.invoke("admin-users", {
          body: {
            page: nextPage,
            per_page: PAGE_SIZE,
            role: nextRole,
            search: nextSearch,
          },
        }),
      )
        .then(({ data, error: invokeError }) => {
          // A newer request started while this one was in flight: drop the result.
          if (requestId !== requestRef.current) return;

          if (invokeError) throw invokeError;

          const payload = data as Partial<AdminUsersPayload> | null;
          if (!payload || !Array.isArray(payload.users)) {
            throw new Error("Admin users service returned an unexpected response.");
          }

          setRows(payload.users);
          setTotal(typeof payload.total === "number" ? payload.total : 0);
          setError(null);
        })
        .catch(async (err: unknown) => {
          if (requestId !== requestRef.current) return;
          // Keep whatever rows are already on screen; never pretend a failed
          // request produced an empty user list.
          setError(await describeFunctionError(err));
        })
        .finally(() => {
          if (requestId === requestRef.current) setLoading(false);
        });
    },
    [],
  );

  useEffect(() => {
    void load(page, roleFilter, debouncedSearch);
  }, [load, page, roleFilter, debouncedSearch, refreshKey]);

  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleAdmin = async (u: AdminUserRow) => {
    const makeAdmin = u.role !== "admin";
    setBusyId(u.id);
    try {
      await adminSetAdmin(u.id, makeAdmin);
      toast.success(makeAdmin ? "Admin access granted" : "Admin access revoked", {
        description: u.email ?? u.name ?? u.id,
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error("Could not change admin access", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = roleFilter !== "all" || debouncedSearch !== "";
  const showFirstLoad = loading && rows.length === 0;

  return (
    <>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Accounts across all roles. Filtering and paging happen on the server so
          this page does not load every account into the browser.
        </p>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by email or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search users by email or name"
            />
          </div>
          <Select
            value={roleFilter}
            onValueChange={(value) => {
              setRoleFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[170px] rounded-xl">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="seller">Seller</SelectItem>
              <SelectItem value="buyer">Buyer</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            className="rounded-xl"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
          >
            <Shield className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <AdminUsersError
            message={error}
            retry={() => setRefreshKey((k) => k + 1)}
          />
        )}

        {showFirstLoad ? (
          <EmptyState
            title="Loading users…"
            description="Fetching accounts from the admin service."
          />
        ) : rows.length === 0 && error ? (
          <EmptyState
            title="Users could not be loaded"
            description="The admin service request failed. Use Try again above."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No users found" : "No users here"}
            description={
              hasFilters
                ? "Try a different search or filter."
                : "No accounts match the selected role yet."
            }
          />
        ) : (
          <div className="surface overflow-hidden">
            <div className="hidden grid-cols-[1fr_1fr_1fr_8rem_9rem_6rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Account</span>
              <span>Name</span>
              <span className="text-center">Role</span>
              <span>Last seen</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-border/60">
              {rows.map((u) => {
                const normalizedRole = (u.role ?? "buyer").toLowerCase();
                const isActive = u.last_sign_in_at != null;
                const email = u.email ?? "—";
                return (
                  <li
                    key={u.id}
                    className="px-6 py-4 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                        {(u.name ?? email).charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {email}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {u.id.slice(0, 8)}…
                        </span>
                      </div>
                      <div className="hidden min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {u.name ?? "—"}
                        </span>
                      </div>
                      <div className="hidden items-center justify-center sm:flex">
                        <Badge variant="outline" className="rounded-lg border-border/70 text-xs font-medium uppercase tracking-wide">
                          {normalizedRole}
                        </Badge>
                      </div>
                      <span className="hidden w-24 text-right text-xs text-muted-foreground sm:block">
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleDateString()
                          : "—"}
                      </span>
                      <div className="flex items-center justify-center sm:flex-col gap-1.5">
                        {isActive ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-success dark:text-success">
                            <CheckCheck className="size-3.5" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <UserX className="size-3.5" /> Inactive
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 sm:flex-col gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          aria-label={
                            u.role === "admin"
                              ? `Revoke admin access for ${u.email ?? u.name ?? "this user"}`
                              : `Grant admin access to ${u.email ?? u.name ?? "this user"}`
                          }
                          title={u.role === "admin" ? "Revoke admin access" : "Grant admin access"}
                          disabled={busyId === u.id}
                          onClick={() => void toggleAdmin(u)}
                        >
                          <Shield className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-lg"
                          asChild
                        >
                          <a
                            href={`mailto:${u.email ?? ""}`}
                            aria-label={`Email ${u.email ?? u.name ?? "this user"}`}
                            title="Email this user"
                          >
                            <AlertTriangle className="size-3.5" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {total > 0 && pages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing page {page} of {pages} · {total} users
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                disabled={page >= pages || loading}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
