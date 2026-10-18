import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  messages: {
    id: string;
    authorId: string;
    authorName: string;
    authorRole: string;
    body: string;
    createdAt: string;
  }[];
  canReply: boolean;
};

async function fetchSellerDisputes(
  sellerId: string,
): Promise<SellerDisputeRow[]> {
  if (!sellerId) return [];

  const { data: ordersBySeller, error: ordersErr } = await supabase
    .from("orders")
    .select(
      "order_no, listing_title, gross_amount, status, created_at, buyer_id",
    )
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

  const orderMap = new Map((ordersBySeller ?? []).map((o) => [o.order_no, o]));

  const buyerIds = new Set<string>();
  disputeRows.forEach((d) => {
    const o = orderMap.get(d.order_no);
    if (o) buyerIds.add(o.buyer_id);
  });

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", [...buyerIds]);
  if (profilesError) throw profilesError;

  const nameBy = new Map<string, string>();
  if (profiles) {
    profiles.forEach((p) => nameBy.set(p.id, p.name ?? "Member"));
  }

  const disputeIds = disputeRows.map((d) => d.id);
  type MessageRow = {
    id: string;
    author_id: string;
    author_role: string | null;
    author_name: string | null;
    body: string;
    created_at: string;
  };
  const messagesByDispute = new Map<string, MessageRow[]>();

  for (const did of disputeIds) {
    const { data: msgs, error: me } = await supabase
      .from("dispute_messages")
      .select("id, author_id, author_role, author_name, body, created_at")
      .eq("dispute_id", did)
      .order("created_at", { ascending: true });

    if (me) throw new Error(friendlyError(me));
    messagesByDispute.set(did, msgs ?? []);
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
      messages: (messagesByDispute.get(d.id) ?? []).map((m) => ({
        id: m.id,
        authorId: m.author_id,
        authorName: m.author_name ?? "Member",
        authorRole:
          m.author_role ?? (buyerIds.has(m.author_id) ? "buyer" : "member"),
        body: m.body,
        createdAt: m.created_at,
      })),
      canReply: d.status === "open" || d.status === "under_review",
    };
  });
}

export default function SellerDisputes() {
  const { user } = useSession();
  const [disputes, setDisputes] = useState<SellerDisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondTo, setRespondTo] = useState<string | null>(null);
  const [text, setText] = useState("");

  const load = useCallback(() => {
    if (!user) return Promise.resolve();
    return Promise.resolve()
      .then(() => fetchSellerDisputes(user.id))
      .then(setDisputes)
      .catch(() => setDisputes([]))
      .finally(() => setLoading(false));
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
                      {d.order_no} · {d.reason} · {formatPrice(d.amount)} in
                      escrow
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
                <p className="mt-3 rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  {d.detail}
                </p>
                {d.messages.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Message thread
                    </p>
                    {d.messages.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-xl bg-muted/40 px-4 py-3 text-sm"
                      >
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {m.authorRole === "seller" ? (
                            <>
                              <span className="font-medium text-foreground">
                                You
                              </span>
                              <span className="text-muted-foreground/60">
                                {new Date(m.createdAt).toLocaleString()}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-medium">
                                {m.authorName}
                              </span>
                              <span className="text-muted-foreground/60">
                                {new Date(m.createdAt).toLocaleString()}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="mt-1.5 text-foreground">{m.body}</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {d.messages.length} message
                  {d.messages.length === 1 ? "" : "s"}
                  {d.canReply &&
                    d.messages.length === 0 &&
                    " · you can be the first to reply"}
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

        <Dialog
          open={respondTo !== null}
          onOpenChange={() => setRespondTo(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Respond to dispute</DialogTitle>
              <DialogDescription>
                Your response is added to the message thread and visible to the
                buyer and trust team.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <textarea
                className="flex min-h-24 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Add your response…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRespondTo(null)}>
                Cancel
              </Button>
              <Button
                disabled={!text.trim()}
                onClick={async () => {
                  try {
                    await reply();
                  } catch {
                    /* handled in reply */
                  }
                }}
              >
                Post response
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SellerLayout>
  );
}
