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
import { SellerLayout } from "@/components/dash/SellerLayout";
import { EmptyState, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { api, useDb, DEMO_SELLER_ID } from "@/lib/db";

/**
 * Seller disputes — buyer-raised issues on this seller's orders.
 */
export default function SellerDisputes() {
  const { disputes } = useDb();
  const mine = disputes.filter((d) => d.sellerId === DEMO_SELLER_ID);
  const [respondTo, setRespondTo] = useState<string | null>(null);
  const [text, setText] = useState("");

  const respond = () => {
    if (!respondTo || !text.trim()) return;
    api.addDisputeResponse(respondTo, {
      author: "Your store",
      role: "seller",
      text: text.trim(),
      date: new Date().toISOString(),
    });
    setText("");
    setRespondTo(null);
  };

  return (
    <SellerLayout>
      <div className="seller-page space-y-6">
        <div className="seller-page-head">
          <h2 className="text-2xl font-bold tracking-tight">Disputes</h2>
          <p className="seller-sub mt-1 text-sm text-muted-foreground">
            Buyer-raised issues on your orders, and your responses to them.
          </p>
        </div>

        {mine.length === 0 ? (
          <EmptyState
            title="No disputes"
            description="If a buyer raises an issue on one of your orders, it appears here."
          />
        ) : (
          <ul className="seller-list space-y-3">
            {mine.map((d) => (
              <li key={d.id} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{d.listingTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.orderRef} · {d.reason} · {formatPrice(d.amount)} in escrow
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
                      <p className="font-medium">{r.author}</p>
                      <p className="mt-1 text-muted-foreground">{r.text}</p>
                    </li>
                  ))}
                </ul>
                {d.status !== "resolved" && (
                  <Button
                    variant="outline"
                    className="mt-3 rounded-xl"
                    onClick={() => setRespondTo(d.id)}
                  >
                    Respond
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!respondTo} onOpenChange={() => setRespondTo(null)}>
        <DialogContent className="card border-border/70 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Respond to dispute</DialogTitle>
            <DialogDescription>
              Your response is shared with the buyer and the trust team.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="inset-well min-h-28 rounded-xl border-border/60"
            placeholder="Share your evidence and explanation…"
          />
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setRespondTo(null)}>
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={respond} disabled={!text.trim()}>
              Submit response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SellerLayout>
  );
}
