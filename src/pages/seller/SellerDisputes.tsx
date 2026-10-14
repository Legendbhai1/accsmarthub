import { useCallback, useEffect, useState } from "react";
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
import { addDisputeMessage } from "@/lib/supabaseMutations";
import { fetchOrder } from "@/lib/supabaseQueries";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/supabaseData";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export type SellerDisputeRow = {
  id: string;
  order_no: string;
  amount: number;
  reason: string;
  detail: string;
  status: string;
  createdAt: string;
  buyerName: string;
  listingTitle: string;
  buyerMessageCount: number;
  canReply: boolean;
};

async function fetchSellerDisputes(
  sellerId: string,
): Promise<SellerDisputeRow[]> {
  if (!sellerId) return [];

  const { data: ordersBySeller, error: ordersErr } = await supabase
    .from("orders")
    .select("order_no, listing_title, gross_amount, status, created_at, buyer_id")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });

  if (ordersErr) throw new Error(friendlyError(ordersErr));

  const inScope = (ordersBySeller ?? [])
    .filter((o) => ["in_escrow", "disputed", "completed"].includes(o.status))
    .map((o) => o.order_no);

  if (inScope.length === 0) return [];

  const { data: disputes, error: de } = await supabase
    .from("disputes")
    .select("id, order_no, reason, detail, status, created_at")
    .in("order_no", inScope)
    .order("created_at", { ascending: false });

  if (de) throw new Error(friendlyError(de));

  const disputeRows = disputes ?? [];
  if (disputeRows.length === 0) return [];

  const orderMap = new Map(
    (ordersBySeller ?? []).map((o) => [o.order_no, o]),
  );

  const buyerIds = new Set<string>();
  disputeRows.forEach((d) => {
    const o = orderMap.get(d.order_no);
    if (o) buyerIds.add(o.buyer_id);
  });

  const { data: profiles, error: pe } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", [...buyerIds]);

  const nameBy = new Map<string, string>();
  if (profiles) {
    profiles.forEach((p) => nameBy.set(p.id, p.name ?? "Member"));
  }

  const disputeIds = disputeRows.map((d) => d.id);
  const messagesByDispute = new Map<string, number>();

  for (const did of disputeIds) {
    const { data: msgs, error: me } = await supabase
      .from("dispute_messages")
      .select("id")
      .eq("dispute_id", did);

    if (me) throw new Error(friendlyError(me));
    messagesByDispute.set(did, msgs?.length ?? 0);
  }

  return disputeRows.map((d) => {
    const o = orderMap.get(d.order_no);
    return {
      id: d.id,
      order_no: d.order_no,
      amount: Number(o?.gross_amount ?? 0),
      reason: d.reason,
      detail: d.detail,
      status: d.status,
      createdAt: d.created_at,
      buyerName: nameBy.get(o?.buyer_id ?? "") ?? "Member",
      listingTitle: o?.listing_title ?? "(removed)",
      buyerMessageCount: messagesByDispute.get(d.id) ?? 0,
      canReply:
        d.status === "open" || d.status === "under_review",
    };
  });
}

export default function SellerDisputes() {
  const { user } = useSession();
  const [disputes, setDisputes] = useState<SellerDisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondTo, setRespondTo] = useState<string | null>(null);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setDisputes(await fetchSellerDisputes(user.id));
    } catch {
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const reply = async () => {
    if (!respondTo || !text.trim()) return;
    try {
      await addDisputeMessage(respondTo, text.trim());
      setText("");
      setRespondTo(null);
      await load();
      toast.success("Response posted", {
        description: "The buyer and trust team can now see your reply.",
      });
    } catch (err) {
      toast.error("Could not post your response", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
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

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading disputes…</p>
        ) : disputes.length === 0 ? (
          <EmptyState
            title="No disputes"
            description="If a buyer raises an issue on one of your orders, it appears here."
          />
        ) : (
          <ul className="seller-list space-y-3">
            {disputes.map((d) => (
              <li key={d.id} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{d.listingTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.order_no} · {d.reason} · {formatPrice(d.amount)} in escrow
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
                <p className="mt-3 rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  {d.detail}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {d.buyerMessageCount} buyer message{d.buyerMessageCount === 1 ? "" : "s"}
                </p>
                {d.canReply && (
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
            <Button className="rounded-xl" onClick={reply} disabled={!text.trim()}>
              Submit response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </SellerLayout>
  );
}
