import { useState } from "react";
import {
  Shield,
  MessageSquare,
  CheckCheck,
  Clock,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useAdminDisputes } from "@/lib/supabaseQueries";
import { supabase } from "@/lib/supabase";

const TABS = [
  { key: "open", label: "Open" },
  { key: "under_review", label: "Under review" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
] as const;

export default function AdminDisputes() {
  const [tab, setTab] = useState<string>("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");

  const disputesQuery = useAdminDisputes();
  const disputes = disputesQuery.data ?? [];

  const filtered = tab === "closed"
    ? []
    : disputes.filter((d) => d.status === tab || (tab === "resolved" && d.status === "resolved"));

  const openDispute = disputes.find((d) => d.id === openId);
  const isOpen = openDispute !== undefined;

  const resolve = async () => {
    if (!openId || !resolution.trim()) return;
    const { error } = await supabase.rpc("close_dispute", {
      p_dispute_id: openId,
      p_resolution: resolution.trim(),
      p_resolution_note: resolution.trim(),
    });
    if (error) throw new Error(error.message);
    setOpenId(null);
    setResolution("");
    disputesQuery.refresh();
  };

  return (
    <DashLayout title="Dispute inbox" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Review open disputes and guide both sides toward resolution. Every
          dispute keeps the order in escrow until an admin closes it.
        </p>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "closed" ? (
          <div className="glass overflow-hidden">
            <EmptyState
              title="No closed disputes shown"
              description="Closed disputes are hidden here for now."
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass overflow-hidden">
            <EmptyState
              title={tab === "under_review" ? "Nothing under review" : `No ${tab} disputes`}
              description={
                tab === "under_review"
                  ? "All disputes are either open or already being handled."
                  : `There are no ${tab} disputes right now.`
              }
            />
          </div>
        ) : (
          <div className="glass overflow-hidden">
            <div className="border-border/70 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Dispute
            </div>
            <ul className="divide-y divide-border/60">
              {filtered.map((d) => (
                <li
                  key={d.id}
                  className="px-5 py-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {d.reason}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {d.order_no} · {d.listing_title}
                      </span>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>Buyer: {d.buyer_name}</span>
                        <span>Seller: {d.seller_name}</span>
                        <span className="text-muted-foreground/60">
                          {new Date(d.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {d.messages.length > 0 && (
                        <Badge variant="outline" className="rounded-full border-border/70 text-xs font-medium uppercase tracking-wide">
                          {d.messages.length} msg
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`rounded-full border-border/70 text-xs font-medium uppercase tracking-wide ${
                          d.status === "open"
                            ? "border-amber-500/30 text-amber-700 dark:text-amber-400"
                            : d.status === "under_review"
                            ? "border-primary/50 text-primary"
                            : "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {d.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => {
                          setOpenId(d.id);
                          setResolution(d.resolution_note ?? "");
                        }}
                      >
                        <MessageSquare className="size-3.5" />
                        Review
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Dialog open={isOpen} onOpenChange={() => setOpenId(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Resolve dispute</DialogTitle>
            </DialogHeader>
            {openDispute && (
              <div className="space-y-4">
                <div className="rounded-xl border-border/70 bg-muted/40 p-4 text-sm">
                  <p className="font-medium">
                    {openDispute.order_no} · {openDispute.listing_title}
                  </p>
                  <p className="mt-1 text-muted-foreground">{openDispute.reason}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Resolution note</label>
                  <Textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Summarize what happened and how this dispute is being closed."
                    rows={5}
                  />
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-3.5" />
                    Closing a dispute releases the escrow hold.
                  </span>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" className="rounded-xl" onClick={() => setOpenId(null)}>
                Cancel
              </Button>
              <Button
                className="rounded-xl"
                disabled={!resolution.trim()}
                onClick={async () => {
                  try {
                    await resolve();
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Could not resolve dispute");
                  }
                }}
              >
                <CheckCheck className="size-4 mr-2" />
                Close dispute
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashLayout>
  );
}
