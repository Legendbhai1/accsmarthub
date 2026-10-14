import { useState } from "react";
import {
  Ticket,
  Search,
  Eye,
  CheckCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { useReports } from "@/lib/supabaseQueries";
import { resolveReport } from "@/lib/supabaseMutations";

const TABS = [
  { key: "open", label: "Open" },
  { key: "reviewing", label: "Under review" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminReports() {
  const [tab, setTab] = useState<TabKey>("open");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const reportsQuery = useReports(
    tab === "resolved" ? "resolved" : tab === "dismissed" ? "resolved" : tab,
  );
  const reports = reportsQuery.data ?? [];

  const filtered =
    q.trim()
      ? reports.filter(
          (r) =>
            r.reason.toLowerCase().includes(q.trim().toLowerCase()) ||
            r.detail.toLowerCase().includes(q.trim().toLowerCase()),
        )
      : reports.filter(
          (r) =>
            tab === "resolved"
              ? r.status === "resolved"
              : tab === "dismissed"
                ? r.status === "resolved"
                : r.status === tab,
        );

  const openReport = reports.find((r) => r.id === openId);

  return (
    <DashLayout title="Reports" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Review off-platform contact and policy reports. Each report keeps the
          reported content visible until an admin closes the case.
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
              placeholder="Search reason or detail"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            className="rounded-xl"
            onClick={() => reportsQuery.refresh()}
          >
            <Ticket className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {filtered.length === 0 ? (
          <div className="glass overflow-hidden">
            <EmptyState
              title={q.trim() ? "No reports found" : `No ${tab.replace("_", " ")} reports`}
              description={
                q.trim()
                  ? "Try a different search term."
                  : `There are no ${tab.replace("_", " ")} reports to review right now.`
              }
            />
          </div>
        ) : (
          <div className="glass overflow-hidden">
            <div className="border-border/70 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Report
            </div>
            <ul className="divide-y divide-border/60">
              {filtered.map((r) => (
                <li
                  key={r.id}
                  className="px-5 py-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.reason}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.order_no ? `${r.order_no} · ` : ""}
                        {r.detail}
                      </span>
                      <div className="mt-1 text-xs text-muted-foreground">
                        reported by{" "}
                        {r.reporter_id.slice(0, 8)}…
                        {r.reported_user_id
                          ? ` against ${r.reported_user_id.slice(0, 8)}…`
                          : ""}
                        · {new Date(r.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`rounded-full border-border/70 text-xs font-medium uppercase tracking-wide ${
                          r.status === "open"
                            ? "border-amber-500/30 text-amber-700 dark:text-amber-400"
                            : r.status === "reviewing"
                              ? "border-primary/50 text-primary"
                              : "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {r.status}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => setOpenId(r.id)}
                      >
                        <Eye className="size-3.5" />
                        Review
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
              <DialogTitle>Review report</DialogTitle>
            </DialogHeader>
            {openReport && (
              <div className="space-y-4">
                <div className="rounded-xl border-border/70 bg-muted/40 p-4 text-sm space-y-2">
                  <p className="font-medium">{openReport.reason}</p>
                  <p className="text-muted-foreground">{openReport.detail}</p>
                  {openReport.order_no && (
                    <p className="text-muted-foreground">
                      Order: {openReport.order_no}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Admin action note
                  </label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What action was taken and why."
                    rows={4}
                  />
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-3.5" />
                    This calls resolve_report against the database. Make sure the
                    report status and any penalty are set on the real row.
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
                Close
              </Button>
              <Button
                className="rounded-xl"
                disabled={!note.trim()}
                onClick={async () => {
                  if (!openId || !note.trim()) return;
                  try {
                    await resolveReport({
                      reportId: openId,
                      status: "resolved",
                      penalty: null,
                    });
                    setOpenId(null);
                    setNote("");
                    reportsQuery.refresh();
                  } catch (err) {
                    alert(
                      err instanceof Error ? err.message : "Could not resolve report",
                    );
                  }
                }}
              >
                <CheckCheck className="size-4 mr-2" />
                Resolve report
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashLayout>
  );
}
