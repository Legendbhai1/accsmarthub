import { useState, useEffect } from "react";
import { UserX, Shield, Mail, CheckCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { useSession, type SessionUser } from "@/lib/session";
import { supabase } from "@/lib/supabase";

type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  updated_at: string;
  aud: string | null;
  role: string | null;
};

type ProfileRow = {
  id: string;
  role: string | null;
  name: string | null;
  avatar_path: string | null;
};

type UsersResult = {
  users: AdminUserRow[];
  isLoading: boolean;
  error: string | null;
};

type UsersQueryReturn = {
  data: UsersResult | undefined;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

function useUsers(queryKey: string[]): UsersQueryReturn {
  const [data, setData] = useState<UsersResult | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const profResult = await supabase
        .from("profiles")
        .select("id, role, name, avatar_path")
        .order("created_at", { ascending: false });

      if (profResult.error) throw new Error(profResult.error.message);
      const profiles: ProfileRow[] = profResult.data ?? [];

      const ids = profiles.map((p) => p.id);
      const users: AdminUserRow[] = [];

      for (const id of ids) {
        const adminResult = await supabase.auth.admin.getUserById(id);
        if (!adminResult.error && adminResult.data?.user) {
          const u = adminResult.data.user;
          const profile = profiles.find((p) => p.id === id);
          users.push({
            id: u.id,
            email: u.email ?? "",
            name: profile?.name ?? null,
            updated_at: u.last_sign_in_at ?? u.created_at ?? "",
            aud: u.aud ?? null,
            role: profile?.role ?? null,
          });
        }
      }

      users.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setData({ users, isLoading: false, error: null });
    } catch (err) {
      setData({ users: [], isLoading: false, error: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      if (data === undefined) setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    run();
    return () => {
      cancelled = true;
    };
  }, queryKey);

  return {
    data,
    isLoading,
    error,
    refresh: run,
  };
}

export default function AdminUsers() {
  const { user } = useSession();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const query = useUsers([q.trim().toLowerCase(), roleFilter]);
  const usersResult = query.data;
  const users = usersResult?.users ?? [];
  const isLoading = usersResult === undefined ? query.isLoading : usersResult.isLoading;
  const error = usersResult?.error ?? query.error;

  const filtered =
    roleFilter === "all"
      ? q.trim()
        ? users.filter(
            (u) =>
              u.email.toLowerCase().includes(q.trim().toLowerCase()) ||
              u.name?.toLowerCase().includes(q.trim().toLowerCase())
          )
        : users
      : users.filter((u) => u.role === roleFilter);

  return (
    <DashLayout title="User management" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Accounts across all roles. Filter by role or email to find a specific
          user, and review activity from here before taking moderation action.
        </p>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by email or name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            className="rounded-xl border-border/70 bg-card px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="seller">Seller</option>
            <option value="buyer">Buyer</option>
          </select>
          <Button className="rounded-xl" onClick={() => query.refresh()}>
            <Shield className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Could not load users: {error}
          </div>
        )}

        {isLoading ? (
          <EmptyState
            title="Loading users…"
            description="Fetching accounts from the platform."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={roleFilter === "all" || q.trim() ? "No users found" : "No users here"}
            description={
              roleFilter === "all" || q.trim()
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
                const normalizedRole = (u.role ?? "member").toLowerCase();
                const isActive = u.aud === "authenticated";
                return (
                  <li
                    key={u.id}
                    className="px-6 py-4 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-sm font-bold text-amber-950">
                        {(u.name ?? u.email.charAt(0).toUpperCase()).charAt(0)}
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
                        {u.updated_at ? new Date(u.updated_at).toLocaleDateString() : "—"}
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
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                        >
                          <Shield className="size-3.5" />
                        </Button>
                        <Button
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
      </div>
    </DashLayout>
  );
}
