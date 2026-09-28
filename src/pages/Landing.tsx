import { useEffect } from "react";
import { useLocation } from "react-router";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  CreditCard,
  Headset,
  LayoutGrid,
  MousePointerClick,
  PackageCheck,
  Percent,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
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
    icon: BadgeCheck,
    title: "Verified sellers",
    body: "Every seller passes identity checks and a review of their catalog before their first sale.",
  },
  {
    icon: ShieldCheck,
    title: "Secure checkout",
    body: "Payments run through a compliant processor. Card details never touch AccSmart servers.",
  },
  {
    icon: PackageCheck,
    title: "Buyer protection",
    body: "If an order doesn't arrive as described, our dispute process makes it right.",
  },
  {
    icon: Clock,
    title: "Fast delivery",
    body: "Most digital products arrive in your inbox within seconds of payment.",
  },
  {
    icon: Percent,
    title: "Transparent pricing",
    body: "The price you see is the price you pay — fees shown clearly before checkout.",
  },
  {
    icon: Headset,
    title: "24/7 support",
    body: "Real humans around the clock for order issues, disputes and account help.",
  },
];

const STEPS = [
  {
    icon: Search,
    title: "Browse",
    body: "Explore categories or search thousands of digital products from verified sellers.",
  },
  {
    icon: MousePointerClick,
    title: "Choose a product",
    body: "Check ratings, what's included and the seller's track record before you commit.",
  },
  {
    icon: CreditCard,
    title: "Pay securely",
    body: "Check out with encrypted payments and buyer protection applied automatically.",
  },
  {
    icon: PackageCheck,
    title: "Receive your product",
    body: "Keys, files and access land in your inbox — usually within seconds.",
  },
];

const FAQS = [
  {
    q: "How fast will I receive my digital product?",
    a: "Most orders are delivered instantly — license keys, download links and codes are emailed within seconds of a successful payment. Scheduled services are booked directly with the seller.",
  },
  {
    q: "What does 'verified seller' mean?",
    a: "Verified sellers have completed identity verification (KYC), maintained a strong delivery record, and keep dispute rates below our thresholds. Look for the badge next to their name.",
  },
  {
    q: "How does buyer protection work?",
    a: "Every purchase is covered. If an item doesn't arrive or doesn't match its listing, open a dispute from your orders page within 30 days. Our team reviews the evidence and refunds eligible orders.",
  },
  {
    q: "What payment methods are supported?",
    a: "Checkout supports major cards and regional methods through our compliant payment provider. AccSmart never sees or stores your raw card details.",
  },
  {
    q: "What products are not allowed on AccSmart?",
    a: "Stolen accounts, compromised credentials, phishing materials, malware, unauthorized access tools, and anything violating third-party platform terms are strictly prohibited and removed on sight.",
  },
  {
    q: "How do I become a seller?",
    a: "Create an account, complete seller onboarding with identity verification, and publish your first product for review. Approved products go live after a moderation check.",
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
                {products.length * 137}+ products · 10 categories · verified sellers
              </Badge>
              <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                Your Smart Marketplace for{" "}
                <span className="text-gradient">Digital Products</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Discover verified digital products and authorized services from
                trusted sellers — delivered instantly, protected on every order.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="clay"
                  size="lg"
                  className="clay-btn rounded-2xl px-7"
                  asChild
                >
                  <Link to="/marketplace">
                    Browse Marketplace
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
                    Become a Seller
                  </a>
                </Button>
              </div>

              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
                {[
                  { value: "18k+", label: "Orders delivered" },
                  { value: "4.8/5", label: "Average rating" },
                  { value: "<60s", label: "Median delivery" },
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
                  Browse by category
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Ten curated aisles of legitimate digital products.
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
                  Featured products
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Hand-picked deals and top-rated picks from our sellers.
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

        {/* ---------------- Why AccSmart ---------------- */}
        <section id="why" className="mt-24 scroll-mt-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Why buyers choose AccSmart
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
                From browsing to delivery in four short steps.
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
                    Turn your digital products into a business.
                  </h2>
                  <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                    List software, assets, courses and services in minutes. Keep
                    92% of every sale, get paid weekly, and let our verification
                    and moderation handle the trust side.
                  </p>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Button variant="clay" className="clay-btn rounded-2xl" asChild>
                      <Link to="/auth">
                        Start Selling
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
                    "92% revenue share, paid weekly",
                    "Fraud & chargeback shielding",
                    "Verification badge for trusted sellers",
                    "Analytics for every listing",
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
                Everything buyers and sellers ask before their first order.
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
