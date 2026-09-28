import { Link, useParams } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, MailCheck, PackageCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useDb } from "@/lib/db";

export default function OrderConfirmed() {
  const { orderId } = useParams<{ orderId: string }>();
  const { orders } = useDb();
  const order = orders.find((o) => o.id === orderId);

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
          {order ? `Order ${order.id} confirmed` : "Order confirmed"}
        </h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          {order ? (
            <>
              Your payment of <span className="font-semibold text-foreground">{formatPrice(order.total)}</span> is
              now held in escrow. The seller has been notified and will begin
              the secure transfer.
            </>
          ) : (
            "Your payment is held in escrow and the seller has been notified to begin the transfer."
          )}
        </p>

        {order && (
          <div className="mt-5 flex items-center justify-center gap-2 text-sm">
            <StatusBadge status={order.status} />
            <span className="text-muted-foreground">· {order.listingTitle}</span>
          </div>
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
          <Button className="rounded-xl" asChild>
            <Link to={order ? `/account/orders/${order.id}` : "/account/orders"}>
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
