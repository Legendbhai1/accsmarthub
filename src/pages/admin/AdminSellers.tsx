import { useState } from "react";
import {
  Shield,
  Search,
  CheckCheck,
  XCircle,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { useReviewQueue } from "@/lib/supabaseQueries";
import { reviewStore } from "@/lib/supabaseMutations";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminSellers() {
  const [tab, setTab] = useState<TabKey>("pending");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [approve, setApprove] = useState<boolean>(false);
  const [note, setNote] = useState("");

  const queueQuery = useReviewQueue(tab);
  const stores = queueQuery.data ?? [];

  const filtered =
    q.trim()
      ? stores.filter(
          (r) =>
            r.store_name.toLowerCase().includes(q.trim().toLowerCase()) ||
            r.slug.toLowerCase().includes(q.trim().toLowerCase()),
        )
      : stores;

  const openStore = stores.find((r) => r.id === openId);

  const submitReview = async () => {
    if (!openId) return;
    try {
      await reviewStore({ storeId: openId, approve, note: note.trim() ?? undefined });
      setOpenId(null);
      setNote("");
      queueQuery.refresh();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Could not review store");
    }
  };

  return (
    <DashLayout title="Seller management" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Review and manage seller stores. Each applicant appears in the pending
          queue until you approve, reject, or request changes.
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

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search store name or slug"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            className="rounded-xl"
            onClick={() => queueQuery.refresh()}
          >
            <Shield className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {filtered.length === 0 ? (
          <div className="surface overflow-hidden">
            <EmptyState
              title={q.trim() ? "No stores found" : `No ${tab} stores`}
              description={
                q.trim()
                  ? "Try a different search term."
                  : `There are no ${tab} stores to review right now.`
              }
            />
          </div>
        ) : (
          <div className="surface overflow-hidden">
            <div className="border-border/70 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Store
            </div>
            <ul className="divide-y divide-border/60">
              {filtered.map((r) => (
                <li key={r.id} className="px-5 py-4 transition-colors hover:bg-accent/30">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                      {r.store_name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.store_name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.slug} · {r.user_id.slice(0, 8)}…
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.platforms.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {r.platforms[0].charAt(0).toUpperCase() +
                            r.platforms[0].slice(1)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                      <Badge
                        variant="outline"
                        className={`rounded-full border-border/70 text-xs font-medium uppercase tracking-wide ${
                          tab === "approved"
                            ? "border-success/30 text-success dark:text-success"
                            : tab === "rejected"
                              ? "border-destructive/30 text-destructive"
                              : "border-warning/30 text-warning"
                        }`}
                      >
                        {tab}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.review_note && (
                        <span className="rounded-lg bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                          Note
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => {
                          setOpenId(r.id);
                          setApprove(tab === "approved");
                          setNote(r.review_note ?? "");
                        }}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Dialog open={openId !== null} onOpenChange={() => setOpenId(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Review store</DialogTitle>
            </DialogHeader>
            {openStore && (
              <div className="space-y-4">
                <div className="rounded-xl border-border/70 bg-muted/40 p-4 text-sm">
                  <p className="font-medium">{openStore.store_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {openStore.slug} · {openStore.user_id.slice(0, 8)}…
                  </p>
                </div>

                <div className="grid gap-3">
                  <label className="text-sm font-medium">Decision</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={approve ? "default" : "outline"}
                      className="rounded-lg"
                      onClick={() => setApprove(true)}
                    >
                      <CheckCheck className="size-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant={!approve ? "default" : "outline"}
                      className="rounded-lg"
                      onClick={() => setApprove(false)}
                    >
                      <XCircle className="size-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Review note</label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Explain the decision for the applicant."
                    rows={4}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setOpenId(null)}
              >
                Close
              </Button>
              <Button
                className="rounded-xl"
                disabled={!note.trim()}
                onClick={async () => {
                  try {
                    await submitReview();
                  } catch (err) {
                    alert(
                      err instanceof Error ? err.message : "Could not review store",
                    );
                  }
                }}
              >
                Save review
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashLayout>
  );
}
