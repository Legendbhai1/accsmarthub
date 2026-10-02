import { Link } from "react-router";
import {
  BadgeCheck,
  FileCheck,
  Gavel,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/site/SiteLayout";

const PILLARS = [
  {
    icon: UserCheck,
    title: "Seller verification",
    body: "Every seller completes government-ID verification (KYC) and submits proof of ownership for each account before it can be listed.",
  },
  {
    icon: Lock,
    title: "Escrow-held funds",
    body: "Buyers' payments are held by the platform and released to the seller only after the buyer confirms the transfer is complete.",
  },
  {
    icon: FileCheck,
    title: "Documented ownership",
    body: "Listings include ownership documentation and transfer records, so provenance can be checked before you commit.",
  },
  {
    icon: Gavel,
    title: "Independent dispute review",
    body: "When something goes wrong, our trust team reviews evidence from both sides and refunds eligible orders from escrow.",
  },
  {
    icon: ShieldCheck,
    title: "Transfer supervision",
    body: "Credential handovers follow a guided process with a 30-day window for raising issues after purchase.",
  },
  {
    icon: BadgeCheck,
    title: "Public track records",
    body: "Seller ratings, sales and dispute history are visible on every listing, so decisions are informed ones.",
  },
];

const PROHIBITED = [
  "Stolen or hacked accounts",
  "Compromised credentials",
  "Phishing material",
  "Malware or unauthorized access tools",
  "Accounts obtained through fraud",
  "Anything violating third-party platform terms",
];

/**
 * Off-platform contact voids the escrow that protects both sides, so it is
 * treated as a listing-blocking offence rather than a style issue.
 */
const NO_OFF_PLATFORM = [
  "Sharing or asking for a phone number, personal email, Telegram or WhatsApp handle.",
  "Requesting or accepting payment outside escrow, including partial deposits.",
  "Moving a transfer to another platform or site before the order is complete.",
  "Delivering credentials through any channel other than the AccsMartHub order flow.",
];

const ENFORCEMENT = [
  "Every listing and store profile is scanned for contact details and external links.",
  "Buyers can report off-platform contact from any order in one click.",
  "Confirmed reports pause the seller's listings and hold their pending payout.",
  "Buyers who pay off-platform receive a full refund from the order's escrow.",
];

export default function Trust() {
  return (
    <SiteLayout>
      <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Trust &amp; safety
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
          A marketplace for accounts only works if both sides can trust the
          process. These are the commitments every order on AccsMartHub is
          held to.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="size-5 text-primary" />
              </span>
              <h2 className="mt-4 font-semibold tracking-tight">{title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>

        <div className="glass mt-10 p-8">
          <h2 className="text-xl font-bold tracking-tight">Strictly prohibited</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Only authorized transfers backed by proof of ownership are
            permitted. The following are banned and removed on sight:
          </p>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {PROHIBITED.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm">
                <span className="size-1.5 rounded-full bg-destructive" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="glass mt-10 border-amber-500/30 p-8">
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <ShieldAlert className="size-5 text-amber-600" />
            Off-platform contact is absolutely prohibited
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every deal must happen on AccsMartHub so escrow, disputes and
            refunds keep working. Sharing contact details or moving payment
            off-platform is not allowed for anyone:
          </p>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {NO_OFF_PLATFORM.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                {item}
              </li>
            ))}
          </ul>

          <h3 className="mt-8 font-semibold tracking-tight">How it is enforced</h3>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {ENFORCEMENT.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button className="rounded-xl" asChild>
            <Link to="/marketplace">Browse verified listings</Link>
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/account/support">Contact support</Link>
          </Button>
        </div>
      </div>
    </SiteLayout>
  );
}
