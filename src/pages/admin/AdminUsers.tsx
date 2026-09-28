import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { ConfirmDialog, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { users as seedUsers, type UserRow } from "@/lib/db";
import { toast } from "sonner";

export default function AdminUsers() {
  const [rows, setRows] = useState<UserRow[]>(seedUsers);
  const [query, setQuery] = useState("");
  const [suspendTarget, setSuspendTarget] = useState<UserRow | null>(null);

  const filtered = rows.filter(
    (u) =>
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()),
  );

  const toggleStatus = (target: UserRow) => {
    setRows((prev) =>
      prev.map((u) =>
        u.id === target.id
          ? { ...u, status: u.status === "active" ? "suspended" : "active" }
          : u,
      ),
    );
    toast.success(
      target.status === "active" ? "User suspended" : "User reinstated",
    );
  };

  return (
    <DashLayout title="User management" nav={adminNav}>
      <div className="space-y-5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users by name or email…"
          aria-label="Search users"
          className="inset-well max-w-sm rounded-xl border-border/60"
        />

        <div className="glass overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3.5">User</th>
                <th className="px-6 py-3.5">Role</th>
                <th className="px-6 py-3.5">Orders</th>
                <th className="px-6 py-3.5">Spent</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-accent/30">
                  <td className="px-6 py-4">
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="px-6 py-4 capitalize">{u.role}</td>
                  <td className="px-6 py-4 tabular-nums">{u.orders}</td>
                  <td className="px-6 py-4 tabular-nums">{formatPrice(u.spent)}</td>
                  <td className="px-6 py-4"><StatusBadge status={u.status} /></td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setSuspendTarget(u)}
                    >
                      {u.status === "active" ? "Suspend" : "Reinstate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={() => setSuspendTarget(null)}
        title={suspendTarget?.status === "active" ? `Suspend ${suspendTarget?.name}?` : `Reinstate ${suspendTarget?.name}?`}
        description={
          suspendTarget?.status === "active"
            ? "Suspended users cannot sign in, buy or sell. Their listings are paused."
            : "The user regains full access to their account."
        }
        confirmLabel={suspendTarget?.status === "active" ? "Suspend user" : "Reinstate user"}
        destructive={suspendTarget?.status === "active"}
        onConfirm={() => suspendTarget && toggleStatus(suspendTarget)}
      />
    </DashLayout>
  );
}
