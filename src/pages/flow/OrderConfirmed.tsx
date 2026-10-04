import { useState } from "react";
import { Link, useParams } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Download,
  Loader2,
  MailCheck,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import {
  fetchOrder,
  completeOrder as completeOrderRpc,
  downloadCredentials,
} from "@/lib/supabaseMutations";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export default function OrderConfirmed() {
  const { orderId } = useParams<{ orderId: string }>();
  const orderNo = orderId ? decodeURIComponent(orderId) : "";
  const { user } = useSession();

  // The confirmed page shows the same data a buyer sees in their order list.
  // During migration we still render the UI for a fresh order that exists only
  // in Supabase, but the demo catalogue did not create that row, so we fall
  // back to the checkout pass-through and let the real order appear once it is
  // in the Supabase `orders` table.
  const [order, setOrder] = useState<{
    order_no: string;
    listing_title: string;
    brand: string;
    quantity: number;
    gross_amount: number;
    escrow_fee_usd: number;
    total_usd: number;
    status: string;
    created_at: string;
  } | null>(null);
  const [loading, setLoading] = useState(orderNo ? "checking" : "idle");
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const refreshOrder = async () => {
    if (!orderNo) return;
    setLoading("checking");
    try {
      const row = await fetchOrder(orderNo);
      if (row) setOrder(row);
    } finally {
      setLoading("ok");
    }
  };

  const confirm = async () => {
    if (!orderNo) return;
    setConfirming(true);
    try {
      await completeOrderRpc({ orderNo });
      toast.success("Transfer confirmed", {
        description: "Escrow has been released to the seller, minus our 10% commission.",
      });
      await refreshOrder();
    } catch (err) {
      toast.error("Could not confirm the transfer", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setConfirming(false);
    }
  };

  // Credentials are fetched from the server on demand and saved straight to
  // disk — the text is never rendered into the page. A multi-unit order gets
  // one file per unit, downloaded sequentially.
  const download = async () => {
    if (!orderNo) return;
    setDownloading(true);
    try {
      const payload = await downloadCredentials(orderNo);
      const files = payload.files;
      for (const file of files) {
        const url = URL.createObjectURL(
          new Blob([file.content], { type: "text/plain" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = file.fileName;
        a.click();
        URL.revokeObjectURL(url);
        // Browsers throttle rapid successive downloads; space them out.
        await new Promise((r) => setTimeout(r, 250));
      }
      toast.success(
        files.length === 1
          ? "Credentials downloaded"
          : `${files.length} accounts downloaded`,
        {
          description: "Keep these files private — they grant full account access.",
        },
      );
    } catch (err) {
      toast.error("Could not download the credentials", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-20 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="glass w-full p-10"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
          <PackageCheck className="size-7 text-emerald-600" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">
          {order ? `Order ${order.order_no} confirmed` : "Order confirmed"}
        </h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          {order ? (
            <>
              Your payment of{" "}
              <span className="font-semibold text-foreground">
                {formatPrice(order.total_usd)}
              </span>{" "}
              is now held in escrow. The seller has been notified and will
              begin the secure transfer.
            </>
          ) : (
            "Your payment is held in escrow and the seller has been notified to begin the transfer."
          )}
        </p>

        {order && (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
              <StatusBadge status={order.status} />
              <span className="text-muted-foreground">· {order.listing_title}</span>
            </div>

            <dl className="mt-5 divide-y divide-border/60 rounded-xl border border-border/60 text-left text-sm">
              {[
                ["Quantity", String(order.quantity)],
                ["Subtotal", formatPrice(order.gross_amount)],
                ["Escrow & protection", formatPrice(order.escrow_fee_usd)],
                ["Paid", formatPrice(order.total_usd)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between px-4 py-2.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {loading !== "ok" && orderNo && (
          <p className="mt-4 text-sm text-muted-foreground">
            Loading your order from Supabase…
          </p>
        )}

        <ul className="mx-auto mt-7 max-w-sm space-y-2.5 text-left text-sm">
          <li className="inset-well flex items-center gap-3 rounded-xl px-4 py-3">
            <MailCheck className="size-4.5 shrink-0 text-primary" />
            Escrow confirmation sent to your email
          </li>
          <li className="inset-well flex items-center gap-3 rounded-xl px-4 py-3">
            <ShieldCheck className="size-4.5 shrink-0 text-emerald-600" />
            Funds stay protected until you confirm the transfer
          </li>
        </ul>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {order && order.status !== "completed" && (
            <Button className="rounded-xl" onClick={confirm}>
              {confirming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PackageCheck className="size-4" />
              )}
              Confirm I received the account
            </Button>
          )}
          {/* Credentials unlock as soon as the order is paid — escrow has the
              buyer's money, so the seller has delivered for a guaranteed sale. */}
          {order && order.status !== "refunded" && (
            <Button
              className="rounded-xl bg-[#15172b]"
              onClick={download}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Download credentials
              {order.quantity > 1 ? ` (${order.quantity} accounts)` : " (.txt)"}
            </Button>
          )}
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/account/orders">
              Track this order <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/marketplace">Continue browsing</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}