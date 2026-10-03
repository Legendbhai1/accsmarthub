import { Link } from "react-router";
import { AlertTriangle, FileWarning, Gavel, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/common/Primitives";

/**
 * /disputes — the public dispute-resolution policy.
 *
 * This page describes the process only. A concrete case can be raised from a
 * real order, which keeps the public page honest: it never shows invented
 * cases, counts or outcomes.
 */

const STEPS = [
  {
    icon: FileWarning,
    title: "1. Open it from your order",
    body: "Every order has a Report action. Tell us what went wrong and attach what you have — screenshots, the seller's messages, the analytics you were promised.",
  },
  {
    icon: Gavel,
    title: "2. An admin reviews the evidence",
    body: "A human reviews both sides. The seller's store answers and delivery record are pulled automatically as part of the case.",
  },
  {
    icon: ShieldCheck,
    title: "3. Funds stay locked until it is resolved",
    body: "Escrow is never released while a dispute is open. The buyer's held funds and the seller's payout are both frozen until a decision is recorded.",
  },
  {
    icon: ShieldCheck,
    title: "4. You get a decision",
    body: "Refund the buyer in full, release the funds to the seller, or split the difference. The outcome and its reason are written to the order.",
  },
];

const GROUNDS = [
  "The account is not what the listing described — wrong follower count, wrong platform, or a materially different niche.",
  "The account is banned, restricted, or in a state that makes it unsellable.",
  "Access was never delivered, or the credentials given do not work.",
  "The seller refused to complete the transfer inside their stated delivery window.",
  "The seller tried to move the deal off-platform, or asked for payment outside escrow.",
];

const WINDOWS = [
  { label: "Report an off-platform contact attempt", value: "Within 30 days of the order" },
  { label: "Report that the account is not as described", value: "Within 14 days of the order" },
  { label: "Report that access was never delivered", value: "Within 7 days of the order" },
];

export default function Disputes() {
  return (
    <div className="overflow-x-clip">
      <section className="mx-auto w-full max-w-4xl px-4 pb-12 pt-16 sm:px-6 sm:pt-20">
        <SectionHeading
          title="Disputes & escrow protection"
          subtitle="What to do when an order goes wrong, who decides, and what happens to your money while the case is open."
        />

        <div className="mt-6 flex items-start gap-4 rounded-3xl border border-destructive/25 bg-destructive/[0.04] p-6">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <h3 className="font-semibold text-destructive">
              Off-platform contact is always a violation
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
              A seller who shares a phone number, personal email, Telegram or
              WhatsApp handle, or a link to pay outside the platform is in
              breach of the terms — regardless of how good the deal looked.
              Those listings are paused and the account is reviewed.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 pb-12 sm:px-6">
        <SectionHeading title="How a dispute is handled" />
        <ol className="mt-6 space-y-3">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="glass flex gap-4 p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#15172b]">
                <Icon className="size-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 pb-12 sm:px-6">
        <SectionHeading
          title="Valid grounds"
          subtitle="A dispute is accepted when one of these is true."
        />
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {GROUNDS.map((ground) => (
            <li
              key={ground}
              className="inset-well rounded-2xl px-5 py-4 text-sm leading-relaxed text-foreground/85"
            >
              {ground}
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 pb-12 sm:px-6">
        <SectionHeading title="Reporting windows" />
        <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-white">
          <dl className="divide-y divide-border/60">
            {WINDOWS.map((row) => (
              <div
                key={row.label}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-4"
              >
                <dt className="text-sm font-medium">{row.label}</dt>
                <dd className="text-sm text-muted-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 pb-20 sm:px-6">
        <div className="glass flex flex-wrap items-center justify-between gap-4 px-6 py-7">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              Something went wrong with an order?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Disputes are opened from the order itself, so the evidence is
              attached to the right transaction automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full" asChild>
              <Link to="/account/orders">Open your orders</Link>
            </Button>
            <Button variant="outline" className="rounded-full" asChild>
              <Link to="/account/support">Contact support</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
