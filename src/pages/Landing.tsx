import { useEffect } from "react";
import { useLocation } from "react-router";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  FileCheck,
  Landmark,
  LayoutGrid,
  Lock,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Store,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CategoryCard } from "@/components/marketplace/CategoryCard";
import { ProductCard } from "@/components/marketplace/ProductCard";
import { HeroVisual } from "@/components/marketplace/HeroVisual";
import { SiteHeader } from "@/components/marketplace/SiteHeader";
import { SiteFooter } from "@/components/marketplace/SiteFooter";
import { categories, products } from "@/data/catalog";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.45, ease: "easeOut" as const },
};

const WHY_ITEMS = [
  {
    icon: UserCheck,
    title: "Verified sellers",
    body: "Every seller completes identity verification (KYC) and proves ownership of each account before it can be listed.",
  },
  {
    icon: Lock,
    title: "Escrow-held funds",
    body: "Your payment is held in escrow and only released to the seller once the transfer is confirmed complete.",
  },
  {
    icon: ShieldCheck,
    title: "Buyer protection",
    body: "If a transfer doesn't match the listing, our dispute team intervenes and eligible orders are refunded in full.",
  },
  {
    icon: FileCheck,
    title: "Documented ownership",
    body: "Listings include ownership documentation and transfer records, so provenance is verifiable before you commit.",
  },
  {
    icon: Landmark,
    title: "Transparent economics",
    body: "The price you see is the price you pay. Escrow and service fees are shown in full before checkout.",
  },
  {
    icon: BadgeCheck,
    title: "Discreet, expert support",
    body: "A specialist team handles every order — from preliminary questions through post-transfer follow-up.",
  },
];

const STEPS = [
  {
    icon: ShieldCheck,
    title: "Browse verified listings",
    body: "Explore accounts by platform, audience size and price. Every listing has been vetted before publication.",
  },
  {
    icon: UserCheck,
    title: "Review the evidence",
    body: "Study analytics, ownership documents and the seller's track record before committing to anything.",
  },
  {
    icon: Lock,
    title: "Pay into escrow",
    body: "Checkout through our secure escrow flow. Your funds are protected — not released — until you confirm the transfer.",
  },
  {
    icon: PackageCheck,
    title: "Confirm the transfer",
    body: "Receive full credentials and ownership documents, verify everything matches the listing, then release escrow.",
  },
];

const FAQS = [
  {
    q: "How does an account transfer actually work?",
    a: "Once your payment clears, it sits in escrow while the seller hands over full credentials and ownership documentation. You confirm the account is exactly as described, then escrow releases the funds to the seller. If anything is wrong, you open a dispute and the funds stay protected.",
  },
  {
    q: "What does “verified seller” mean here?",
    a: "Verified sellers have completed identity verification (KYC), proven ownership of every account they list, and maintained a clean dispute record across previous transfers. Look for the badge next to their name.",
  },
  {
    q: "How does buyer protection work?",
    a: "Every purchase is covered. If an account doesn't match its listing or the transfer fails, open a dispute from your orders page within 30 days. Our team reviews the evidence from both sides, and eligible orders are refunded in full from escrow.",
  },
  {
    q: "Is buying or selling accounts allowed by the platforms?",
    a: "Most major platforms restrict the transfer of accounts in their terms of service, and policies change over time. We require sellers to disclose platform standing and transfer history, and we recommend you review the relevant platform terms and seek your own advice before purchasing.",
  },
  {
    q: "What is never allowed on Digital Product Hub?",
    a: "Stolen accounts, compromised credentials, phishing materials, malware, unauthorized access tools, and anything violating third-party platform terms are strictly prohibited and removed on sight. Only authorized transfers backed by proof of ownership are permitted.",
  },
  {
    q: "How do I sell an account?",
    a: "Create an account, complete seller onboarding with identity verification, and submit your listing with proof of ownership. Every listing passes a moderation review before it goes live, and payouts release only after the buyer confirms the transfer.",
  },
];

export default function Landing() {
  const location = useLocation();
  const featured = products.filter((p) => p.oldPrice || p.rating >= 4.8).slice(0, 8);

  // Smooth-scroll when arriving from another page via /#section
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const el = document.getElementById(id);
    if (el) {
      requestAnimationFrame(() =>
        el.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }, [location.hash]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* ---------------- Hero ---------------- */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:pt-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <Badge
                variant="secondary"
                className="clay-inset mb-6 gap-1.5 rounded-full border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                <Sparkles className="size-3.5 text-primary" />
                {products.length * 137}+ accounts transferred · 10 platforms · escrow on every order
              </Badge>
              <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                The Professional Marketplace for{" "}
                <span className="text-gradient">Social Media Accounts</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Buy and sell established accounts with confidence. Every seller
                is verified, every transfer is documented, and your funds stay
                in escrow until the deal is done.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="clay"
                  size="lg"
                  className="clay-btn rounded-2xl px-7"
                  asChild
                >
                  <Link to="/marketplace">
                    Browse Listings
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-2xl"
                  asChild
                >
                  <a
                    href="/#seller-cta"
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .getElementById("seller-cta")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    <Store className="size-4" />
                    Sell an Account
                  </a>
                </Button>
              </div>

              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
                {[
                  { value: "18k+", label: "Accounts transferred" },
                  { value: "4.8/5", label: "Average seller rating" },
                  { value: "100%", label: "Escrow-protected" },
                ].map((stat) => (
                  <div key={stat.label} className="clay-inset rounded-2xl p-3.5">
                    <dt className="sr-only">{stat.label}</dt>
                    <dd className="text-xl font-bold tabular-nums">
                      {stat.value}
                    </dd>
                    <dd className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                      {stat.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </motion.div>

            <HeroVisual />
          </div>
        </section>

        {/* ---------------- Categories ---------------- */}
        <section id="categories" className="scroll-mt-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <motion.div {...fadeUp} className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Browse by platform
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Ten established platforms, each with a vetted roster of
                  account listings.
                </p>
              </div>
              <Button variant="ghost" className="hidden rounded-xl sm:inline-flex" asChild>
                <Link to="/marketplace">
                  View all <ArrowRight className="size-4" />
                </Link>
              </Button>
            </motion.div>
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {categories.map((category) => (
                <CategoryCard key={category.slug} category={category} />
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Featured products ---------------- */}
        <section id="featured" className="mt-24 scroll-mt-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <motion.div {...fadeUp} className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Featured accounts
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Exceptional listings with strong audiences and proven
                  performance.
                </p>
              </div>
              <Button variant="ghost" className="hidden rounded-xl sm:inline-flex" asChild>
                <Link to="/marketplace">
                  View all <ArrowRight className="size-4" />
                </Link>
              </Button>
            </motion.div>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Why Digital Product Hub ---------------- */}
        <section id="why" className="mt-24 scroll-mt-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Why buyers choose Digital Product Hub
              </h2>
              <p className="mt-2 text-muted-foreground">
                A trust layer under every transaction — not an afterthought.
              </p>
            </motion.div>
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {WHY_ITEMS.map(({ icon: Icon, title, body }) => (
                <motion.div key={title} {...fadeUp} className="clay p-6">
                  <div className="clay-inset flex size-11 items-center justify-center rounded-2xl">
                    <Icon className="size-5 text-primary" strokeWidth={1.9} />
                  </div>
                  <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- How it works ---------------- */}
        <section id="how-it-works" className="mt-24 scroll-mt-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                How it works
              </h2>
              <p className="mt-2 text-muted-foreground">
                From discovery to a completed transfer in four steps.
              </p>
            </motion.div>
            <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, body }, index) => (
                <motion.li key={title} {...fadeUp} className="clay relative p-6">
                  <span
                    className="absolute right-5 top-5 text-4xl font-bold text-foreground/10"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div
                    className="flex size-11 items-center justify-center rounded-2xl"
                    style={{
                      background:
                        "linear-gradient(145deg, oklch(0.72 0.13 229 / 85%), oklch(0.6 0.15 285 / 85%))",
                      boxShadow:
                        "inset 0 2px 3px oklch(1 0 0 / 30%), 0 6px 14px -5px oklch(0.67 0.15 260 / 55%)",
                    }}
                  >
                    <Icon className="size-5 text-white" strokeWidth={1.9} />
                  </div>
                  <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </motion.li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- Seller CTA ---------------- */}
        <section id="seller-cta" className="mt-24 scroll-mt-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <motion.div
              {...fadeUp}
              className="clay relative overflow-hidden p-8 sm:p-12"
            >
              <div
                className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-secondary/25 blur-3xl"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute -bottom-24 left-10 size-64 rounded-full bg-primary/20 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
                <div>
                  <Badge
                    variant="secondary"
                    className="clay-inset mb-4 gap-1.5 rounded-full border-border/60 px-3 py-1 text-xs text-muted-foreground"
                  >
                    <LayoutGrid className="size-3.5 text-secondary" />
                    Seller Center
                  </Badge>
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Sell your account to a serious buyer.
                  </h2>
                  <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                    List your established account in front of qualified buyers.
                    Keep 92% of the sale price, get paid the moment the transfer
                    is confirmed, and let our verification and moderation teams
                    handle the trust side.
                  </p>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Button variant="clay" className="clay-btn rounded-2xl" asChild>
                      <Link to="/auth">
                        List Your Account
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" className="rounded-2xl" asChild>
                      <a
                        href="/#faq"
                        onClick={(e) => {
                          e.preventDefault();
                          document
                            .getElementById("faq")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        Read seller FAQ
                      </a>
                    </Button>
                  </div>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {[
                    "Keep 92% of the sale price",
                    "Escrow releases only after buyer confirmation",
                    "KYC badge that serious buyers trust",
                    "Valuation guidance for every listing",
                  ].map((point) => (
                    <li
                      key={point}
                      className="clay-inset flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm"
                    >
                      <BadgeCheck className="size-4 shrink-0 text-primary" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section id="faq" className="mt-24 scroll-mt-24">
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            <motion.div {...fadeUp} className="text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Frequently asked questions
              </h2>
              <p className="mt-2 text-muted-foreground">
                Everything buyers and sellers ask before their first transfer.
              </p>
            </motion.div>
            <motion.div {...fadeUp} className="clay mt-8 px-6 py-2">
              <Accordion type="single" collapsible className="w-full">
                {FAQS.map((faq, index) => (
                  <AccordionItem key={faq.q} value={`faq-${index}`}>
                    <AccordionTrigger className="text-left text-sm font-medium sm:text-base">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
