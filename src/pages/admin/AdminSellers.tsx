import { BadgeCheck, BadgeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { sellers } from "@/lib/db";
import { toast } from "sonner";

export default function AdminSellers() {
  return (
    <DashLayout title="Seller management" nav={adminNav}>
      <div className="glass overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-6 py-3.5">Seller</th>
              <th className="px-6 py-3.5">Rating</th>
              <th className="px-6 py-3.5">Sales</th>
              <th className="px-6 py-3.5">KYC</th>
              <th className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sellers.map((s) => (
              <tr key={s.id} className="transition-colors hover:bg-accent/30">
                <td className="px-6 py-4">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Member since {new Date(s.memberSince).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </p>
                </td>
                <td className="px-6 py-4 tabular-nums">
                  {s.rating.toFixed(1)} ({s.reviews.toLocaleString()})
                </td>
                <td className="px-6 py-4 tabular-nums">{s.sales.toLocaleString()}</td>
                <td className="px-6 py-4">
                  {s.verified ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600">
                      <BadgeCheck className="size-4" /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-amber-600">
                      <BadgeX className="size-4" /> Pending
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() =>
                      toast.success(
                        s.verified
                          ? "Verification revoked (demo)"
                          : "Seller marked verified (demo)",
                      )
                    }
                  >
                    {s.verified ? "Revoke" : "Verify"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashLayout>
  );
}
