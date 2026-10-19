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
    title: "Store and listing review",
    body: "Every store application is reviewed by an admin before its listings can go live, and each listing is moderated before it appears in the marketplace.",
  },
  {
    icon: Lock,
    title: "Funds held in-platform",
    body: "Buyers' payments are held in AccsMartHub's internal ledger and released to the seller only after the buyer confirms the transfer, or the inspection window closes.",
  },
  {
    icon: FileCheck,
    title: "Listed details on the order",
    body: "Each order stores the price, fee and commission that applied when it was placed, so the split is auditable after the fact.",
  },
  {
    icon: Gavel,
    title: "Admin dispute review",
    body: "When something goes wrong, our admin team reviews evidence from both sides and refunds eligible orders from the order's held funds.",
  },
  {
    icon: ShieldCheck,
    title: "A disclosed inspection window",
    body: "Every order carries a 14-day window from purchase for raising an issue, and the deadline is stored on the order so it cannot be moved afterwards.",
  },
  {
    icon: BadgeCheck,
    title: "No invented track records",
    body: "We do not show seller ratings, sales totals or verification badges, because that data is not recorded yet. A listing is only visible here once it has passed moderation.",
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
  "Buyers can report off-platform contact from any order in one click.",
  "Reports go to an admin queue with the order, listing and participant attached.",
  "When an admin resolves a report against a seller, that seller's active listings are paused.",
  "Confirmed off-platform payments are not covered by the order's held funds, so never pay outside AccsMartHub.",
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
            Account transfers are restricted by most platforms, so listings
            that break these rules are removed when reported or found. The
            following are banned:
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
            <Link to="/marketplace">Browse the marketplace</Link>
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/account/support">Contact support</Link>
          </Button>
        </div>
      </div>
    </SiteLayout>
  );
}
