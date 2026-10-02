import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { GenericId } from "convex/values";
import { BadgeCheck, BadgeX, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { api } from "@/convex/_generated/api";
import { sellers } from "@/lib/db";
import { toast } from "sonner";

type Filter = "pending" | "approved" | "rejected";

/**
 * The approval gate. Until an admin presses Approve, the applicant's store
 * stays "pending" and `publishListing` rejects their attempts server-side.
 */
export default function AdminSellers() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{
    id: GenericId<"stores">;
    name: string;
  } | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const queue = useQuery(api.stores.reviewQueue, { status: filter });
  const approveStore = useMutation(api.stores.approveStore);
  const rejectStore = useMutation(api.stores.rejectStore);

  const approve = async (storeId: GenericId<"stores">, storeName: string) => {
    setBusyId(storeId);
    try {
      await approveStore({ storeId });
      toast.success(`${storeName} approved`, {
        description: "The seller can now create listings.",
      });
    } catch (err) {
      toast.error("Approval failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await rejectStore({ storeId: rejecting.id, note: rejectNote });
      toast("Store rejected", { description: "Any live listings were paused." });
      setRejecting(null);
      setRejectNote("");
    } catch (err) {
      toast.error("Rejection failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const visible = queue ?? [];

  return (
    <DashLayout title="Seller management" nav={adminNav}>
      <div className="space-y-6">
        {/* Store applications */}
        <section aria-label="Store applications" className="glass p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Store applications</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Check the answers and logo. Approving flips the account to an
                approved seller and unlocks listing creation.
              </p>
            </div>
            <div className="flex gap-1.5">
              {(["pending", "approved", "rejected"] as const).map((f) => (
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
                <li
                  key={a._id}
                  className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-muted/40">
                    {a.logoUrl ? (
                      <img
                        src={a.logoUrl}
                        alt={a.storeName}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {a.storeName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{a.storeName}</p>
                      {a.status === "pending" ? (
                        <Badge className="bg-amber-500/15 text-[11px] font-medium text-amber-700">
                          <Clock className="mr-1 size-3" /> Pending
                        </Badge>
                      ) : a.status === "approved" ? (
                        <Badge className="bg-emerald-500/15 text-[11px] font-medium text-emerald-700">
                          <CheckCircle2 className="mr-1 size-3" /> Approved
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/15 text-[11px] font-medium text-red-600">
                          <XCircle className="mr-1 size-3" /> Rejected
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Submitted {new Date(a.createdAt).toLocaleDateString()}
                      {a.reviewNote && ` · Note: ${a.reviewNote}`}
                    </p>
                    <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                      {a.answers.map((ans) => (
                        <div key={ans.question}>
                          <dt className="text-xs font-medium text-muted-foreground">
                            {ans.question}
                          </dt>
                          <dd>{ans.answer}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                      No-off-platform-contact policy:{" "}
                      {a.contactPolicy ? "accepted" : "not accepted"}
                    </p>
                  </div>
                  {a.status === "pending" && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        className="rounded-lg"
                        disabled={busyId === a._id}
                        onClick={() => approve(a._id, a.storeName)}
                      >
                        <BadgeCheck className="size-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg text-muted-foreground hover:text-destructive"
                        disabled={busyId === a._id}
                        onClick={() => setRejecting({ id: a._id, name: a.storeName })}
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
                      Member since{" "}
                      {new Date(s.memberSince).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
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
                    <Badge variant="secondary">Managed in Stores tab</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="glass border-border/70 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tell the applicant what to fix. Any live listings from this store are
            paused.
          </p>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            className="inset-well min-h-24 rounded-xl border-border/60"
            placeholder="e.g. Your sourcing description is too vague — tell us how accounts are vetted."
          />
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              disabled={!rejectNote.trim() || busyId === rejecting?.id}
              onClick={reject}
            >
              Reject store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashLayout>
  );
}