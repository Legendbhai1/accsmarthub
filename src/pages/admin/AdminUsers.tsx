import { useState, useEffect } from "react";
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
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { useSession } from "@/lib/session";
import { invokableSupabase } from "@/lib/supabase";

type AdminUserRow = {
  id: string;
  email: string;
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

type AdminUsersResult = {
  data?: AdminUsersPayload;
  error: string | null;
  loading: boolean;
  refresh: () => void;
};

const PAGE_SIZE = 50;

function useAdminUsers(
  page: number,
  roleFilter: string,
  search: string,
): AdminUsersResult {
  const [data, setData] = useState<AdminUsersPayload | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fetcherRef = useState(() => async () => {
    setError(null);
    setLoading(true);
    try {
      const supabase = invokableSupabase();
      const status = roleFilter === "all" ? "all" : roleFilter;
      const { data: invokeData, error: invokeError } = await supabase.functions
        .invoke("admin-users", {
          body: { page, per_page: PAGE_SIZE, status, search },
        });

      if (invokeError) {
        throw new Error(
          invokeError.message ?? "AdminUsers service returned an error.",
        );
      }

      const payload = (invokeData as AdminUsersPayload) ?? {
        users: [],
        total: 0,
        page,
        per_page: PAGE_SIZE,
      };
      setData(payload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load admin users.",
      );
      setData({ users: [], total: 0, page, per_page: PAGE_SIZE });
    } finally {
      setLoading(false);
    }
  }).ref;

  useEffect(() => {
    let cancelled = false;
    fetcherRef.current().then(() => {
      if (!cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [page, roleFilter, search]);

  return {
    data,
    error,
    loading,
    refresh: () => {
      let mounted = true;
      fetcherRef.current().then(() => {
        if (!mounted) return;
      });
      // Not awaited here; the caller uses `loading` in the meantime.
    },
  };
}

function AdminUsersError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="rounded-xl border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
  const { user } = useSession();
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const query = useAdminUsers(page, roleFilter, search.trim());
  const payload = query.data;
  const rows = payload?.users ?? [];
  const total = payload?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtered =
    roleFilter === "all" && !search.trim()
      ? rows
      : search.trim()
        ? rows.filter(
            (u) =>
              u.email.toLowerCase().includes(search.trim().toLowerCase()) ||
              u.name?.toLowerCase().includes(search.trim().toLowerCase()),
          )
        : rows.filter((u) => u.role === roleFilter);

  return (
    <DashLayout title="User management" nav={adminNav}>
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
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
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
            onClick={() => query.refresh()}
            disabled={query.loading}
          >
            <Shield className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {query.error && (
          <AdminUsersError
            message={query.error}
            retry={() => query.refresh()}
          />
        )}

        {query.loading && rows.length === 0 ? (
          <EmptyState
            title="Loading users…"
            description="Fetching accounts from the admin service."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              roleFilter !== "all" || search.trim()
                ? "No users found"
                : "No users here"
            }
            description={
              roleFilter !== "all" || search.trim()
                ? "Try a different search or filter."
                : "No accounts match the selected role yet."
            }
          />
        ) : (
          <div className="glass overflow-hidden">
            <div className="hidden grid-cols-[1fr_1fr_1fr_8rem_9rem_6rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Account</span>
              <span>Name</span>
              <span className="text-center">Role</span>
              <span>Last seen</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-border/60">
              {filtered.map((u) => {
                const normalizedRole =
                  (u.role ?? "member").toLowerCase();
                const isActive = u.last_sign_in_at != null;
                return (
                  <li
                    key={u.id}
                    className="px-6 py-4 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-sm font-bold text-amber-950">
                        {u.name != null
                          ? u.name.charAt(0).toUpperCase()
                          : u.email.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {u.email}
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
                        <Badge variant="outline" className="rounded-full border-border/70 text-xs font-medium uppercase tracking-wide">
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
                          <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCheck className="size-3.5" />
                            Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <UserX className="size-3.5" />
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 sm:flex-col sm:gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                        >
                          <Shield className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-lg"
                        >
                          <AlertTriangle className="size-3.5" />
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
              Showing page {page} of {pages}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashLayout>
  );
}
