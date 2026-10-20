import { useState } from "react";
import {
  MessageSquare,
  CheckCheck,
  AlertTriangle,
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
import { disputeReasonLabel } from "@/lib/disputeReasons";
import { useAdminDisputes } from "@/lib/supabaseQueries";
import { resolveDispute } from "@/lib/supabaseMutations";

const TABS = [
  { key: "open", label: "Open" },
  { key: "under_review", label: "Under review" },
  { key: "resolved_buyer", label: "Resolved - buyer" },
  { key: "resolved_seller", label: "Resolved - seller" },
  { key: "dismissed", label: "Dismissed" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminDisputes() {
  const [tab, setTab] = useState<TabKey>("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<
    "resolved_buyer" | "resolved_seller" | "dismissed"
  >("resolved_seller");
  const [note, setNote] = useState("");

  const disputesQuery = useAdminDisputes();
  const disputes = disputesQuery.data ?? [];

  const filtered = disputes.filter(
    (d) =>
      tab === "open"
        ? d.status === "open"
        : tab === "under_review"
          ? d.status === "under_review"
          : d.status === tab,
  );

  const openDispute = disputes.find((d) => d.id === openId);
  const isOpen = openDispute !== undefined;

  const resolve = async () => {
    if (!openId || !note.trim()) return;
    try {
      await resolveDispute(openId, outcome, note.trim());
      setOpenId(null);
      setNote("");
      disputesQuery.refresh();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Could not resolve dispute");
    }
  };

  return (
    <DashLayout title="Dispute inbox" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Review open disputes and guide both sides toward resolution. Every
          dispute keeps the order in escrow until an admin resolves it.
        </p>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="surface overflow-hidden">
            <EmptyState
              title={
                tab === "open"
                  ? "Nothing open"
                  : tab === "under_review"
                    ? "Nothing under review"
                    : `No ${tab.replace("_", " ")} disputes`
              }
              description={
                tab === "open"
                  ? "All disputes are either under review or already resolved."
                  : tab === "under_review"
                    ? "All disputes are either open or already being handled."
                    : `There are no ${tab.replace("_", " ")} disputes right now.`
              }
            />
          </div>
        ) : (
          <div className="surface overflow-hidden">
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
                        {disputeReasonLabel(d.reason)}
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
                        <Badge variant="outline" className="rounded-lg border-border/70 text-xs font-medium uppercase tracking-wide">
                          {d.messages.length} msg
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`rounded-lg border-border/70 text-xs font-medium uppercase tracking-wide ${
                          d.status === "open"
                            ? "border-warning/30 text-warning"
                            : d.status === "under_review"
                              ? "border-primary/50 text-primary"
                              : "border-success/30 text-success dark:text-success"
                        }`}
                      >
                        {d.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => {
                          setOpenId(d.id);
                          setNote(d.resolution_note ?? "");
                          setOutcome(
                            d.status === "resolved_buyer"
                              ? "resolved_buyer"
                              : d.status === "resolved_seller"
                                ? "resolved_seller"
                                : "resolved_seller",
                          );
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
                  <p className="mt-1 text-muted-foreground">{disputeReasonLabel(openDispute.reason)}</p>
                </div>

                <div className="grid gap-3">
                  <label className="text-sm font-medium">Resolution</label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant={outcome === "resolved_buyer" ? "default" : "outline"}
                      className="rounded-lg"
                      onClick={() =>
                        setOutcome("resolved_buyer")
                      }
                    >
                      Refund buyer
                    </Button>
                    <Button
                      type="button"
                      variant={outcome === "resolved_seller" ? "default" : "outline"}
                      className="rounded-lg"
                      onClick={() =>
                        setOutcome("resolved_seller")
                      }
                    >
                      Release to seller
                    </Button>
                    <Button
                      type="button"
                      variant={outcome === "dismissed" ? "default" : "outline"}
                      className="rounded-lg"
                      onClick={() =>
                        setOutcome("dismissed")
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Resolution note</label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Summarize what happened and how this dispute is being closed."
                    rows={5}
                  />
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-3 py-1.5 text-warning">
                    <AlertTriangle className="size-3.5" />
                    This uses the database’s resolve_dispute outcome set and
                    records an audit note when the function is wired up.
                  </span>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setOpenId(null)}
              >
                Cancel
              </Button>
              <Button
                className="rounded-xl"
                disabled={!note.trim()}
                onClick={async () => {
                  try {
                    await resolve();
                  } catch (err) {
                    alert(
                      err instanceof Error ? err.message : "Could not resolve dispute",
                    );
                  }
                }}
              >
                <CheckCheck className="size-4 mr-2" />
                Resolve dispute
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashLayout>
  );
}
