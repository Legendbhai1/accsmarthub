import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  MessageSquareWarning,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { ConfirmDialog, EmptyState, StatusBadge } from "@/components/common/Primitives";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { api, getSeller, useDb } from "@/lib/db";

const TIMELINE: { key: string; label: string }[] = [
  { key: "pending", label: "Order placed" },
  { key: "in_escrow", label: "Funds in escrow" },
  { key: "transferring", label: "Transfer in progress" },
  { key: "completed", label: "Completed" },
];

const DISPUTE_REASONS = ["Not as described", "Transfer failed", "Seller unresponsive", "Other"];

export default function BuyerOrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const { orders, disputes } = useDb();
  const order = orders.find((o) => o.id === orderId);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState(DISPUTE_REASONS[0]);
  const [detail, setDetail] = useState("");

  if (!order) {
    return (
      <DashLayout title="Order" nav={buyerNav}>
        <EmptyState
          title="Order not found"
          description="This order doesn't exist or belongs to another account."
          action={
            <Button variant="outline" className="rounded-xl" asChild>
              <Link to="/account/orders">Back to orders</Link>
            </Button>
          }
        />
      </DashLayout>
    );
  }

  const seller = getSeller(order.sellerId);
  const dispute = disputes.find((d) => d.orderId === order.id);
  const timelineIdx = TIMELINE.findIndex((t) => t.key === order.status);
  const canConfirm = order.status === "transferring";
  const canDispute = ["in_escrow", "transferring"].includes(order.status);

  const confirmTransfer = () => {
    setAdvancing(true);
    window.setTimeout(() => {
      api.advanceOrder(order.id);
      setAdvancing(false);
      setConfirmOpen(false);
    }, 800);
  };

  const openDispute = () => {
    if (!detail.trim()) return;
    api.openDispute(order.id, reason, detail.trim());
    setDetail("");
    setDisputeOpen(false);
  };

  return (
    <DashLayout title={`Order ${order.id}`} nav={buyerNav}>
      <div className="space-y-6">
        <Link
          to="/account/orders"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to orders
        </Link>

        {/* Header card */}
        <div className="glass p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex size-12 items-center justify-center rounded-xl border border-border/70 bg-muted/40">
                <BrandMark brand={order.brand} colored className="size-6" />
              </span>
              <div>
                <h2 className="text-lg font-bold tracking-tight">{order.listingTitle}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Order #{order.id} · placed {new Date(order.createdAt).toLocaleDateString()} · Qty {order.quantity}
                </p>
              </div>
            </div>
            <div className="text-right">
              <StatusBadge status={order.status} />
              <p className="mt-2 text-xl font-bold tabular-nums">{formatPrice(order.total)}</p>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="glass p-6">
          <h3 className="font-semibold">Transfer progress</h3>
          {order.status === "disputed" || order.status === "refunded" ? (
            <p className="mt-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
              This order is {order.status}. See the dispute section below for
              details and next steps.
            </p>
          ) : (
            <ol className="mt-5 grid gap-4 sm:grid-cols-4">
              {TIMELINE.map((step, i) => {
                const done = i <= timelineIdx;
                const current = i === timelineIdx;
                return (
                  <li key={step.key} className="flex items-start gap-2.5">
                    {done ? (
                      <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-emerald-400" />
                    ) : (
                      <Circle className="mt-0.5 size-4.5 shrink-0 text-muted-foreground/40" />
                    )}
                    <div>
                      <p className={current ? "text-sm font-semibold" : "text-sm"}>
                        {step.label}
                      </p>
                      {current && (
                        <p className="text-xs text-muted-foreground">Current stage</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {canConfirm && (
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <Button className="rounded-xl" onClick={() => setConfirmOpen(true)} disabled={advancing}>
                {advancing ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Confirm transfer & release escrow
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground sm:max-w-64">
                Only confirm once you have full access and everything matches
                the listing.
              </p>
            </div>
          )}
        </div>

        {/* Details grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="glass p-6">
            <h3 className="font-semibold">Payment summary</h3>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Unit price</dt>
                <dd className="tabular-nums">{formatPrice(order.unitPrice)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Quantity</dt>
                <dd className="tabular-nums">{order.quantity}</dd>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-2.5 font-bold">
                <dt>Total (escrowed)</dt>
                <dd className="tabular-nums">{formatPrice(order.total)}</dd>
              </div>
            </dl>
          </div>

          <div className="glass p-6">
            <h3 className="font-semibold">Seller</h3>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-sm font-bold text-primary">
                {seller.name.charAt(0)}
              </span>
              <div>
                <p className="text-sm font-medium">{seller.name}</p>
                <p className="text-xs text-muted-foreground">
                  {seller.rating.toFixed(1)} rating · {seller.responseTime}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Dispute section */}
        <div className="glass p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Disputes</h3>
            {canDispute && !dispute && (
              <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="rounded-xl">
                    <MessageSquareWarning className="size-4" />
                    Open a dispute
                  </Button>
                </DialogTrigger>
                <DialogContent className="glass border-border/70 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Open a dispute</DialogTitle>
                    <DialogDescription>
                      Escrow freezes while our trust team reviews. Both sides
                      can submit evidence; eligible orders are refunded.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="dispute-reason">Reason</Label>
                      <select
                        id="dispute-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="inset-well h-10 rounded-xl px-3 text-sm outline-none"
                      >
                        {DISPUTE_REASONS.map((r) => (
                          <option key={r} value={r} className="bg-popover">
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="dispute-detail">What went wrong?</Label>
                      <Textarea
                        id="dispute-detail"
                        value={detail}
                        onChange={(e) => setDetail(e.target.value)}
                        placeholder="Describe the issue with as much detail as possible…"
                        className="inset-well min-h-24 rounded-xl border-border/60"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" className="rounded-xl" onClick={() => setDisputeOpen(false)}>
                      Cancel
                    </Button>
                    <Button variant="destructive" className="rounded-xl" onClick={openDispute} disabled={!detail.trim()}>
                      Submit dispute
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {dispute ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <StatusBadge status={dispute.status} />
                <span className="font-medium">{dispute.reason}</span>
                <span className="text-muted-foreground">{formatPrice(dispute.amount)} in escrow</span>
              </div>
              <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                {dispute.detail}
              </p>
              <ul className="space-y-2.5">
                {dispute.responses.map((r, i) => (
                  <li key={i} className="inset-well rounded-xl px-4 py-3 text-sm">
                    <p className="font-medium capitalize">{r.author} · {r.role}</p>
                    <p className="mt-1 text-muted-foreground">{r.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No dispute on this order. You have 30 days from purchase to raise
              an issue.
            </p>
          )}
        </div>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Confirm transfer and release escrow?"
          description="This releases the held funds to the seller. Only confirm once you have full access and the account matches its listing."
          confirmLabel="Release escrow"
          onConfirm={confirmTransfer}
        />
      </div>
    </DashLayout>
  );
}
