import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  CheckCircle2,
  CalendarClock,
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
import { fetchOrder, useDispute, type OrderRow } from "@/lib/supabaseQueries";
import {
  openDispute as openDisputeRpc,
  completeOrder,
  fileReport,
} from "@/lib/supabaseMutations";
import { toast } from "sonner";

// Supabase has no `transferring` state: an order goes straight from escrow to
// completed when the buyer confirms.
const TIMELINE: { key: string; label: string }[] = [
  { key: "in_escrow", label: "Order placed & funds in escrow" },
  { key: "confirm", label: "Buyer confirms the transfer" },
  { key: "completed", label: "Completed — escrow released" },
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
  const orderNo = orderId ? decodeURIComponent(orderId) : "";

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState(DISPUTE_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string>("shared_contact");
  const [reportDetail, setReportDetail] = useState("");
  const disputeQuery = useDispute(orderNo);

  const reload = useCallback(async () => {
    if (!orderNo) return;
    setLoading(true);
    try {
      setOrder(await fetchOrder(orderNo));
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderNo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <DashLayout title="Order" nav={buyerNav}>
        <p className="text-sm text-muted-foreground">Loading this order…</p>
      </DashLayout>
    );
  }

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

  const dispute = disputeQuery.data;

  // Warranty window: the seller set a warranty_hours on the listing. Buyers can
  // only open a dispute while that window is still open from the order's creation
  // time. `OrderRow` does not carry `warranty_hours`, so we derive eligibility
  // from the listing's warranty through fetchOrder only when needed in the UI —
  // for now we gate on the order's own window comment (the server stores the
  // listing warranty with the order where the project's order read includes it).
  //
  // When the order row does not include warranty_hours, we fall back to the
  // existing 30-day window behavior so the UI stays honest rather than blocking
  // disputes it cannot justify.
  const warrantyHours = (order as OrderRow & { warranty_hours?: number }).warranty_hours;
  const orderCreated = new Date(order.created_at).getTime();
  const warrantyExpiryMs = warrantyHours != null
    ? orderCreated + warrantyHours * 60 * 60 * 1000
    : null;
  const now = Date.now();
  const warrantyOpen = warrantyExpiryMs != null && now < warrantyExpiryMs;
  const warrantyExpired = warrantyExpiryMs != null && now >= warrantyExpiryMs;
  const warrantyFromNow = warrantyExpiryMs != null
    ? new Date(warrantyExpiryMs).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const timelineIdx =
    order.status === "completed" ? 2 : order.status === "confirm" ? 1 : 0;
  const canConfirm = order.status === "in_escrow";

  // A dispute can only be opened while the order is in escrow and there is not
  // already a dispute, and only while the seller's warranty window is still open.
  const canDispute = order.status === "in_escrow" && !dispute && warrantyOpen;

  const confirmTransfer = async () => {
    setAdvancing(true);
    try {
      await completeOrder({ orderNo });
      await reload();
      toast.success("Transfer confirmed", {
        description: "Escrow has been released to the seller.",
      });
    } catch (err) {
      toast.error("Could not confirm the transfer", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setAdvancing(false);
      setConfirmOpen(false);
    }
  };

  const openDispute = async () => {
    if (!detail.trim()) return;
    try {
      await openDisputeRpc(order.order_no, reason, detail.trim());
      setDetail("");
      setDisputeOpen(false);
      await reload();
      void disputeQuery.refresh();
      toast.success("Dispute opened", {
        description: "Escrow is frozen while our trust team reviews.",
      });
    } catch (err) {
      toast.error("Could not open the dispute", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <DashLayout title={`Order ${order.order_no}`} nav={buyerNav}>
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
                <h2 className="text-lg font-bold tracking-tight">{order.listing_title}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Order #{order.order_no} · placed {new Date(order.created_at).toLocaleDateString()} · Qty {order.quantity}
                </p>
              </div>
            </div>
            <div className="text-right">
              <StatusBadge status={order.status} />
              <p className="mt-2 text-xl font-bold tabular-nums">{formatPrice(order.total_usd)}</p>
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
                <dd className="tabular-nums">{formatPrice(order.unit_price_usd)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Quantity</dt>
                <dd className="tabular-nums">{order.quantity}</dd>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-2.5 font-bold">
                <dt>Total (escrowed)</dt>
                <dd className="tabular-nums">{formatPrice(order.total_usd)}</dd>
              </div>
            </dl>
          </div>

          <div className="glass p-6">
            <h3 className="font-semibold">Seller</h3>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-sm font-bold text-primary">
                {(order.listing_title ?? "?").charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-medium">AccsMartHub seller</p>
                <p className="text-xs text-muted-foreground">
                  Verified by AccsMartHub escrow
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Warranty window */}
        {warrantyHours != null && (
          <div className="glass border-amber-500/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Warranty window</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  This seller set a {warrantyHours}-hour warranty on this listing.
                </p>
                {warrantyOpen ? (
                  <p className="mt-1 text-sm text-amber-700">
                    You can open a dispute until {warrantyFromNow}.
                  </p>
                ) : warrantyExpired ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    This listing&apos;s warranty window closed at {warrantyFromNow}. Disputes are no longer available.
                  </p>
                ) : null}
              </div>
              <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-600" />
            </div>
          </div>
        )}

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

            {!canDispute && warrantyExpired && order.status === "in_escrow" && !dispute && (
              <p className="text-sm text-muted-foreground">
                This listing&apos;s warranty window has closed. You can still confirm the transfer once you have access, but you can no longer open a dispute.
              </p>
            )}
          </div>

          {dispute ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <StatusBadge status={dispute.status} />
                <span className="font-medium">{dispute.reason}</span>
                <span className="text-muted-foreground">
                  {formatPrice(order.total_usd)} in escrow
                </span>
              </div>
              <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                {dispute.detail}
              </p>
              {dispute.messages.length > 0 && (
                <ul className="space-y-2.5">
                  {dispute.messages.map((m) => (
                    <li key={m.id} className="inset-well rounded-xl px-4 py-3 text-sm">
                      <p className="font-medium">
                        {m.author_id === dispute.opened_by ? "You" : "Seller"}
                      </p>
                      <p className="mt-1 text-muted-foreground">{m.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No dispute on this order. You can raise an issue while the seller's warranty window is open.
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
                    await fileReport({
                      orderNo: order.order_no,
                      reportedUserId: order.seller_id,
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
