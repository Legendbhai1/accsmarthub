import { useState, useEffect, useCallback } from "react";
import { ExternalLink, LifeBuoy, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { BrandMark } from "@/components/site/BrandMark";
import { EmptyState, StatusBadge } from "@/components/common/Primitives";
import { TELEGRAM_LINKS } from "@/lib/contact";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/supabaseData";
import { fileReport, type FileReportInput } from "@/lib/supabaseMutations";
import { toast } from "sonner";

export type SupportTicket = {
  id: string;
  status: "open" | "answered" | "closed";
  createdAt: string;
  subject: string;
};

export default function BuyerSupport() {
  const { user } = useSession();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");

  const load = useCallback(() => {
    return Promise.resolve()
      .then(() => {
        if (!user) return null;
        return supabase
          .from("off_platform_reports")
          .select("id, status, created_at, reason, detail")
          .eq("reporter_id", user.id)
          .order("created_at", { ascending: false });
      })
      .then((res) => {
        if (!res) {
          setTickets([]);
          return;
        }
        const { data: rows, error: re } = res;
        if (re) throw new Error(friendlyError(re));

        setTickets(
          (rows ?? []).map((r) => ({
            id: r.id,
            subject:
              r.reason === "shared_contact"
                ? "Off-platform contact reported"
                : r.reason === "payment_offsite"
                  ? "Off-platform payment reported"
                  : r.reason === "refused_escrow"
                    ? "Escrow refusal reported"
                    : r.reason === "impersonation"
                      ? "Impersonation reported"
                      : "Support request",
            status:
              r.status === "resolved"
                ? "answered"
                : r.status === "dismissed"
                  ? "closed"
                  : "open",
            createdAt: r.created_at,
          })),
        );
      })
      .catch(() => {
        setTickets([]);
      })
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!user || !subject.trim()) return;
    try {
      // A support request is not a report against anyone, so no
      // `reportedUserId` is sent. Passing the reporter's own id here used to
      // make resolve_report() pause their own listings.
      await fileReport({
        reason: "other",
        detail: `${subject.trim()}\n\n${detail.trim()}`,
      } as FileReportInput);
      setSubject("");
      setDetail("");
      setOpen(false);
      await load();
      toast.success("Ticket submitted", {
        description: "Our team will reply here.",
      });
    } catch (err) {
      toast.error("Could not submit the ticket", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <DashLayout title="Support" nav={buyerNav}>
      <div className="space-y-5">
        {/* The two out-of-app ways to reach us, ahead of the ticket form.
            Both are Telegram: the channel is where updates are posted, and
            the bot is a direct line to support. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {TELEGRAM_LINKS.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="surface card-hover flex items-start gap-3 p-4"
            >
              <span
                className="icon-tile size-9"
                style={{ ["--tile" as string]: "var(--pop-cyan)" }}
              >
                <BrandMark brand="telegram" className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {link.label}
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                </span>
                <span className="mt-0.5 block font-mono text-xs text-primary">
                  {link.handle}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {link.description}
                </span>
              </span>
            </a>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Our team reviews every request. Replies appear here.
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl">
                <MessageSquarePlus className="size-4" />
                New ticket
              </Button>
            </DialogTrigger>
            <DialogContent className="surface border-border/70 sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Open a support ticket</DialogTitle>
                <DialogDescription>
                  Include your order number if the issue relates to a purchase.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="ticket-subject">Subject</Label>
                  <Input
                    id="ticket-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="inset-well rounded-xl border-border/60"
                    placeholder="e.g. Transfer window extension"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ticket-detail">Message</Label>
                  <Textarea
                    id="ticket-detail"
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    className="inset-well min-h-24 rounded-xl border-border/60"
                    placeholder="Describe what you need help with…"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" className="rounded-xl" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button className="rounded-xl" onClick={create} disabled={!subject.trim()}>
                  Submit ticket
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading tickets…</p>
        ) : tickets.length === 0 ? (
          <EmptyState
            title="No tickets"
            description="Support conversations appear here."
            action={
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                <LifeBuoy className="size-5 text-primary" />
              </span>
            }
          />
        ) : (
          <ul className="space-y-3">
            {tickets.map((t) => (
              <li key={t.id} className="surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t.subject}</p>
                  <StatusBadge status={t.status} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashLayout>
  );
}
