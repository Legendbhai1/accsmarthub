import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { api, useDb, type Dispute } from "@/lib/db";
import { toast } from "sonner";

export default function AdminDisputes() {
  const { disputes } = useDb();
  const [respondTo, setRespondTo] = useState<Dispute | null>(null);
  const [text, setText] = useState("");

  const respond = () => {
    if (!respondTo || !text.trim()) return;
    api.addDisputeResponse(respondTo.id, {
      author: "AccsMartHub Trust",
      role: "admin",
      text: text.trim(),
      date: new Date().toISOString(),
    });
    setText("");
    setRespondTo(null);
  };

  const resolve = (d: Dispute, outcome: "refund_buyer" | "release_seller") => {
    api.resolveDispute(d.id, outcome);
    toast.success(
      outcome === "refund_buyer"
        ? "Dispute resolved — buyer refunded from escrow"
        : "Dispute resolved — funds released to seller",
    );
  };

  return (
    <DashLayout title="Dispute management" nav={adminNav}>
      <ul className="space-y-3">
        {disputes.map((d) => (
          <li key={d.id} className="glass p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{d.listingTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {d.orderRef} · {d.reason} · {formatPrice(d.amount)} in escrow ·{" "}
                  opened {new Date(d.createdAt).toLocaleDateString()}
                </p>
              </div>
              <StatusBadge status={d.status} />
            </div>
            <p className="mt-3 rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              {d.detail}
            </p>
            <ul className="mt-3 space-y-2">
              {d.responses.map((r, i) => (
                <li key={i} className="inset-well rounded-xl px-4 py-3 text-sm">
                  <p className="font-medium">{r.author} · <span className="capitalize">{r.role}</span></p>
                  <p className="mt-1 text-muted-foreground">{r.text}</p>
                </li>
              ))}
            </ul>
            {d.status !== "resolved" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => setRespondTo(d)}>
                  Respond
                </Button>
                <Button className="rounded-xl" onClick={() => resolve(d, "refund_buyer")}>
                  Resolve: refund buyer
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => resolve(d, "release_seller")}>
                  Resolve: release seller
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={!!respondTo} onOpenChange={() => setRespondTo(null)}>
        <DialogContent className="glass border-border/70 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Respond as trust team</DialogTitle>
            <DialogDescription>
              Your note is visible to both parties.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="inset-well min-h-28 rounded-xl border-border/60"
            placeholder="Status update or evidence request…"
          />
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setRespondTo(null)}>
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={respond} disabled={!text.trim()}>
              Post response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashLayout>
  );
}
