import { useState } from "react";
import { LifeBuoy, MessageSquarePlus } from "lucide-react";
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
import { EmptyState, StatusBadge } from "@/components/common/Primitives";
import { api, useDb } from "@/lib/db";

export default function BuyerSupport() {
  const { tickets } = useDb();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");

  const mine = tickets.filter((t) => t.userId === "u-me");

  const create = () => {
    if (!subject.trim()) return;
    api.createTicket("u-me", subject.trim());
    setSubject("");
    setDetail("");
    setOpen(false);
  };

  return (
    <DashLayout title="Support" nav={buyerNav}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Our team replies within a few hours, 24/7.
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl">
                <MessageSquarePlus className="size-4" />
                New ticket
              </Button>
            </DialogTrigger>
            <DialogContent className="glass border-border/70 sm:max-w-md">
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

        {mine.length === 0 ? (
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
            {mine.map((t) => (
              <li key={t.id} className="glass p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t.subject}</p>
                  <StatusBadge status={t.status} />
                </div>
                <ul className="mt-3 space-y-2.5">
                  {t.messages.map((m, i) => (
                    <li key={i} className="inset-well rounded-xl px-4 py-3 text-sm">
                      <p className="font-medium">{m.author}</p>
                      <p className="mt-1 text-muted-foreground">{m.text}</p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashLayout>
  );
}
