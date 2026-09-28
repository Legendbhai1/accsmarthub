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
    a: "Your payment is held by AccsMartHub and only released to the seller after you confirm the account transfer is complete. If the listing doesn't match its description, the transaction is covered by our dispute process and eligible orders are refunded in full.",
  },
  {
    q: "How are sellers verified?",
    a: "Sellers complete government-ID verification (KYC) and submit proof of ownership for every account they list. Verified sellers carry a badge, and their dispute history is visible on their profile.",
  },
  {
    q: "How long does a transfer take?",
    a: "Most transfers complete within 24 hours. The seller hands over credentials and ownership documents, you verify access, and escrow releases once you confirm everything matches the listing.",
  },
  {
    q: "What fees does AccsMartHub charge?",
    a: "Buyers pay a 3% escrow and protection fee at checkout. Sellers keep 92% of the sale price; the 8% platform fee is deducted when earnings are credited after a completed transfer.",
  },
  {
    q: "What happens if something goes wrong?",
    a: "Open a dispute from your order page within 30 days. Our trust team reviews the evidence from both sides and refunds eligible orders from escrow. Support is available around the clock.",
  },
  {
    q: "Is buying or selling accounts allowed by the platforms?",
    a: "Most major platforms restrict account transfers in their terms of service, and policies change over time. We require sellers to disclose platform standing and transfer history, and we recommend reviewing the relevant platform terms before purchasing.",
  },
  {
    q: "What is never allowed on AccsMartHub?",
    a: "Stolen accounts, hacked or compromised credentials, phishing material and malware are strictly prohibited. Every listing must be backed by proof of ownership, and violating listings are removed on sight.",
  },
  {
    q: "How do payouts work for sellers?",
    a: "When a sale clears escrow, your earnings (92% of the sale price) are credited to your seller balance. Request a withdrawal at any time — payouts process within one business day.",
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
