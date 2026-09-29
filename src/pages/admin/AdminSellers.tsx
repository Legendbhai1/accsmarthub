import { useState } from "react";
import { BadgeCheck, BadgeX, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { api, sellers, useDb } from "@/lib/db";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export default function AdminSellers() {
  const { sellerApplications } = useDb();
  const { approveSellerApplication, rejectSellerApplication } = useSession();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  const visible =
    filter === "all"
      ? sellerApplications
      : sellerApplications.filter((a) => a.status === filter);

  const act = (applicationId: string, decision: "approved" | "rejected", targetUserId: string) => {
    api.setApplicationStatus(applicationId, decision);
    if (decision === "approved") {
      approveSellerApplication(targetUserId);
      toast.success("Store approved — seller dashboard unlocked for the applicant.");
    } else {
      rejectSellerApplication(targetUserId);
      toast("Application rejected.");
    }
  };

  return (
    <DashLayout title="Seller management" nav={adminNav}>
      <div className="space-y-6">
        {/* Store applications */}
        <section aria-label="Store applications" className="glass p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Store applications</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Approving an application flips the account into a seller with
                full listing access.
              </p>
            </div>
            <div className="flex gap-1.5">
              {(["pending", "approved", "rejected", "all"] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  className="rounded-lg capitalize"
                  onClick={() => setFilter(f)}
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title="No applications here"
              description="Store applications from buyers appear in this queue."
            />
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {visible.map((a) => (
                <li key={a.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{a.storeName}</p>
                      {a.status === "pending" ? (
                        <Badge variant="secondary" className="bg-amber-500/15 text-[11px] font-medium text-amber-700">
                          <Clock className="mr-1 size-3" /> Pending
                        </Badge>
                      ) : a.status === "approved" ? (
                        <Badge variant="secondary" className="bg-emerald-500/15 text-[11px] font-medium text-emerald-700">
                          <CheckCircle2 className="mr-1 size-3" /> Approved
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-red-500/15 text-[11px] font-medium text-red-600">
                          <XCircle className="mr-1 size-3" /> Rejected
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.name} · {a.email} · {new Date(a.createdAt).toLocaleDateString()}
                    </p>
                    <p className="mt-2 text-sm">
                      <span className="font-medium">Focus:</span> {a.platformFocus}
                    </p>
                    {a.experience && (
                      <p className="mt-1 text-sm text-muted-foreground">{a.experience}</p>
                    )}
                    <p className="mt-1 text-sm text-muted-foreground">{a.reason}</p>
                  </div>
                  {a.status === "pending" && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        className="rounded-lg"
                        onClick={() => act(a.id, "approved", a.userId)}
                      >
                        <BadgeCheck className="size-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() => act(a.id, "rejected", a.userId)}
                      >
                        <BadgeX className="size-4" />
                        Reject
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Existing sellers */}
        <section aria-label="Sellers" className="glass overflow-x-auto">
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
        </section>
      </div>
    </DashLayout>
  );
}
