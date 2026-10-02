import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation } from "convex/react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  MessageSquareWarning,
  ShieldAlert,
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
import { api as convexApi } from "@/convex/_generated/api";
import { toast } from "sonner";

const TIMELINE: { key: string; label: string }[] = [
  { key: "pending", label: "Order placed" },
  { key: "in_escrow", label: "Funds in escrow" },
  { key: "transferring", label: "Transfer in progress" },
  { key: "completed", label: "Completed" },
];

const DISPUTE_REASONS = ["Not as described", "Transfer failed", "Seller unresponsive", "Other"];

/** Off-platform contact is a policy breach, not a payment problem. */
const REPORT_REASONS = [
  { value: "shared_contact", label: "Seller shared phone/email/chat handle" },
  { value: "payment_offsite", label: "Asked me to pay outside AccsMartHub" },
  { value: "refused_escrow", label: "Refused to use escrow" },
  { value: "impersonation", label: "Impersonating AccsMartHub staff" },
  { value: "other", label: "Other policy breach" },
] as const;

export default function BuyerOrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const { orders, disputes } = useDb();
  const order = orders.find((o) => o.id === orderId);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState(DISPUTE_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string>("shared_contact");
  const [reportDetail, setReportDetail] = useState("");
  const reportOffPlatform = useMutation(convexApi.reports.reportOffPlatform);

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
            <p className="mt-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600">
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
                      <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-emerald-600" />
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

        {/* Off-platform contact is prohibited on AccsMartHub. Reporting it triggers a
   trust-team review and can pause the seller's listings. */}
        <div className="glass border-amber-500/30 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Policy: stay on AccsMartHub</h3>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Sellers must never share a phone number, personal email or chat
                handle, and must never ask you to pay outside escrow. Deals moved
                off-platform lose escrow protection and are fully refundable.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setReportOpen(true)}
            >
              <ShieldAlert className="size-4" />
              Report off-platform contact
            </Button>
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

        {/* Off-platform contact report */}
        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent className="glass border-border/70 sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Report off-platform contact</DialogTitle>
              <DialogDescription>
                Our trust team reviews every report. Confirmed breaches can
                pause a seller's listings and hold their balance.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="report-reason">What happened?</Label>
                <select
                  id="report-reason"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="inset-well h-10 rounded-xl px-3 text-sm outline-none"
                >
                  {REPORT_REASONS.map((r) => (
                    <option key={r.value} value={r.value} className="bg-popover">
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="report-detail">Details</Label>
                <Textarea
                  id="report-detail"
                  value={reportDetail}
                  onChange={(e) => setReportDetail(e.target.value)}
                  placeholder="Describe what the seller said or did, and when…"
                  className="inset-well min-h-24 rounded-xl border-border/60"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                className="rounded-xl"
                onClick={() => setReportOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="rounded-xl"
                disabled={reportDetail.trim().length < 10}
                onClick={async () => {
                  try {
                    await reportOffPlatform({
                      orderNo: order.id,
                      reportedUserId: order.sellerId,
                      reason: reportReason as (typeof REPORT_REASONS)[number]["value"],
                      detail: reportDetail.trim(),
                    });
                    toast.success("Report submitted", {
                      description: "Our trust team will review it shortly.",
                    });
                    setReportOpen(false);
                    setReportDetail("");
                  } catch (err) {
                    toast.error("Could not submit the report", {
                      description:
                        err instanceof Error ? err.message : "Please try again.",
                    });
                  }
                }}
              >
                Submit report
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
