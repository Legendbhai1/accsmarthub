import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  MailCheck,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketplace/SiteHeader";
import { SiteFooter } from "@/components/marketplace/SiteFooter";

export default function OrderConfirmed() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="clay w-full max-w-lg p-10 text-center"
        >
          <div
            className="mx-auto flex size-16 items-center justify-center rounded-full"
            style={{
              background:
                "linear-gradient(145deg, oklch(0.75 0.13 165 / 90%), oklch(0.55 0.13 165 / 90%))",
              boxShadow:
                "inset 0 2px 4px oklch(1 0 0 / 35%), 0 10px 22px -8px oklch(0.6 0.14 165 / 60%)",
            }}
          >
            <PackageCheck className="size-8 text-white" />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">
            Order confirmed!
          </h1>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Thank you for your purchase. Your digital products are on their way
            to your inbox — most orders arrive within seconds.
          </p>

          <ul className="mx-auto mt-7 max-w-sm space-y-2.5 text-left text-sm">
            <li className="clay-inset flex items-center gap-3 rounded-2xl px-4 py-3">
              <MailCheck className="size-4.5 shrink-0 text-primary" />
              Delivery email sent with keys, codes and download links
            </li>
            <li className="clay-inset flex items-center gap-3 rounded-2xl px-4 py-3">
              <ShieldCheck className="size-4.5 shrink-0 text-emerald-400" />
              30-day buyer protection active on this order
            </li>
          </ul>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button variant="clay" className="rounded-2xl" asChild>
              <Link to="/marketplace">
                Keep browsing <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="rounded-2xl" asChild>
              <Link to="/dashboard">View my orders</Link>
            </Button>
          </div>
        </motion.div>
      </main>
      <SiteFooter />
    </div>
  );
}
