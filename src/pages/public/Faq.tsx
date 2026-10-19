import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SiteLayout } from "@/components/site/SiteLayout";

const FAQS = [
  {
    q: "How does escrow protect my purchase?",
    a: "Your payment is held in AccsMartHub's internal ledger and only released to the seller after you confirm the account transfer is complete, or after the 14-day inspection window closes. If the listing doesn't match its description, the transaction is covered by our dispute process and eligible orders are refunded in full.",
  },
  {
    q: "How are sellers checked?",
    a: "Every store application is reviewed by an admin before its listings can go live, and each listing is moderated before it appears in the marketplace. We do not currently run government-ID (KYC) verification, and we do not display verification badges or seller ratings, because that data is not recorded yet.",
  },
  {
    q: "How long does a transfer take?",
    a: "Timing depends on the seller. You have 14 days from purchase to inspect the account and raise a dispute; the seller hands over credentials through the order page, you verify access, and escrow releases once you confirm everything matches the listing.",
  },
  {
    q: "What fees does AccsMartHub charge?",
    a: "Buyers pay a 3% escrow and protection fee at checkout. Sellers keep 90% of the sale price; the 10% platform commission is deducted when the order's escrow is released.",
  },
  {
    q: "What happens if something goes wrong?",
    a: "Open a dispute from your order page within the 14-day inspection window. Our admin team reviews the evidence from both sides and refunds eligible orders from the order's held funds.",
  },
  {
    q: "Is buying or selling accounts allowed by the platforms?",
    a: "Most major platforms restrict account transfers in their terms of service, and policies change over time. We require sellers to disclose platform standing and transfer history, and we recommend reviewing the relevant platform terms before purchasing.",
  },
  {
    q: "What is never allowed on AccsMartHub?",
    a: "Stolen accounts, hacked or compromised credentials, phishing material and malware are strictly prohibited. Violating listings are removed when reported or found.",
  },
  {
    q: "How do payouts work for sellers?",
    a: "When an order's escrow is released, your earnings (90% of the sale price) are credited to your seller balance, shown in your dashboard from the live ledger. Withdrawal requests are not enabled yet — they will be switched on once a payout provider is connected.",
  },
];

export default function Faq() {
  return (
    <SiteLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Frequently asked questions
        </h1>
        <p className="mt-3 text-muted-foreground">
          Everything buyers and sellers ask before their first transfer.
        </p>
        <div className="glass mt-8 px-6 py-2">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq) => (
              <AccordionItem key={faq.q} value={faq.q}>
                <AccordionTrigger className="text-left text-sm font-medium sm:text-base">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </SiteLayout>
  );
}
