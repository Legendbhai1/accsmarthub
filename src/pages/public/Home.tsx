import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Gavel,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/site/BrandMark";
import { ListingCard } from "@/components/common/ListingCard";
import { SectionHeading } from "@/components/common/Primitives";
import { categories, useDb, getSeller } from "@/lib/db";
import { formatFollowers } from "@/lib/format";

const FAQS = [
  {
    q: "How does escrow protect my purchase?",
    a: "Your payment is held by AccsMartHub and only released to the seller after you confirm the account transfer is complete. If the listing does not match its description, the transaction is covered by our dispute process and eligible orders are refunded in full.",
  },
  {
    q: "How are sellers verified?",
    a: "Sellers complete government-ID verification (KYC) and submit proof of ownership for every account they list. Verified sellers carry a badge, and their dispute history is public on their profile.",
  },
  {
    q: "How long does a transfer take?",
    a: "Most transfers complete within 24 hours. The seller hands over credentials and ownership documents, you verify access, and escrow releases once you confirm everything matches the listing.",
  },
  {
    q: "What happens if something goes wrong?",
    a: "Open a dispute from your order page within 30 days. Our trust team reviews the evidence from both sides and refunds eligible orders from escrow. You can also reach support 24/7.",
  },
  {
    q: "What is not allowed on AccsMartHub?",
    a: "Stolen accounts, hacked or compromised credentials, phishing material and malware are strictly prohibited. Every listing must be backed by proof of ownership, and violating listings are removed on sight.",
  },
  {
    q: "How do payouts work for sellers?",
    a: "When a sale clears escrow, your earnings are credited to your seller balance. Request a withdrawal at any time — payouts are processed within one business day.",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const { listings } = useDb();
  const [query, setQuery] = useState("");

  const active = listings.filter((l) => l.status === "active");
  const featured = [...active].sort((a, b) => b.rating - a.rating).slice(0, 4);
  const recent = [...active].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ).slice(0, 8);
  const popular = [...categories].sort((a, b) => b.listingCount - a.listingCount).slice(0, 6);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/marketplace?q=${encodeURIComponent(q)}` : "/marketplace");
  };

  return (
    <div>
      {/* ------------------------------ Hero ------------------------------ */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <Badge
              variant="secondary"
              className="mb-6 gap-1.5 rounded-full border-border/60 bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <Sparkles className="size-3.5 text-primary" />
              Escrow-protected transfers on every order
            </Badge>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Buy & sell social media accounts,{" "}
              <span className="text-gradient">without the risk</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              AccsMartHub connects buyers and sellers of established accounts
              across every major platform. Verified sellers, documented
              ownership, and escrow that releases only when the deal is done.
            </p>

            <form onSubmit={submitSearch} role="search" className="mt-8 max-w-xl">
              <label htmlFor="hero-search" className="sr-only">
                Search the marketplace
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="hero-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Try “fitness TikTok 300K” or “monetized YouTube”"
                    className="inset-well h-12 w-full rounded-2xl pl-11 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60"
                  />
                </div>
                <Button type="submit" size="lg" className="rounded-2xl">
                  Search
                </Button>
              </div>
            </form>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
              {[
                { value: "18k+", label: "Transfers completed" },
                { value: "4.8/5", label: "Average seller rating" },
                { value: "100%", label: "Escrow protected" },
              ].map((stat) => (
                <div key={stat.label} className="glass px-4 py-3.5">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="text-xl font-bold tabular-nums">{stat.value}</dd>
                  <dd className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {stat.label}
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12, ease: "easeOut" }}
            className="glass p-6"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <div>
                <p className="text-xs text-muted-foreground">Live marketplace</p>
                <p className="mt-1 text-sm font-semibold">{active.length} active listings</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Escrow online
              </span>
            </div>
            <ul className="mt-4 space-y-3">
              {featured.slice(0, 4).map((l) => (
                <li key={l.id}>
                  <Link
                    to={`/listing/${l.id}`}
                    className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-accent/50"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
                      <BrandMark brand={l.brand} colored className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatFollowers(l.followers)} followers · {getSeller(l.sellerId).name}
                      </span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      ${l.price.toLocaleString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="mt-5 w-full rounded-xl" asChild>
              <Link to="/marketplace">
                Browse all listings <ArrowRight className="size-4" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* --------------------------- Categories --------------------------- */}
      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <SectionHeading
          title="Browse by platform"
          subtitle="Ten established platforms, each with a vetted roster of listings."
          action={
            <Button variant="ghost" className="hidden rounded-xl sm:inline-flex" asChild>
              <Link to="/marketplace">
                View all <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((category) => (
            <Link
              key={category.slug}
              to={`/marketplace?category=${category.slug}`}
              className="glass glass-hover flex flex-col p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <BrandMark brand={category.brand} colored className="size-6" />
              <h3 className="mt-4 text-sm font-semibold tracking-tight">{category.name}</h3>
              <p className="mt-3 text-xs font-medium text-primary/90">
                {category.listingCount.toLocaleString()} listings
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------- Featured listings ------------------------ */}
      <section className="mt-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <SectionHeading
            title="Featured listings"
            subtitle="Top-rated accounts with proven performance."
            action={
              <Button variant="ghost" className="hidden rounded-xl sm:inline-flex" asChild>
                <Link to="/marketplace">
                  View all <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------- Recently added -------------------------- */}
      <section className="mt-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <SectionHeading
            title="Recently added"
            subtitle="The newest listings to pass verification."
          />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.slice(0, 8).map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------ Popular categories ------------------------ */}
      <section className="mt-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <SectionHeading
            title="Popular categories"
            subtitle="Where most buyers are looking right now."
          />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popular.map((category) => (
              <Link
                key={category.slug}
                to={`/marketplace?category=${category.slug}`}
                className="glass glass-hover flex items-center gap-4 p-5"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-muted/40">
                  <BrandMark brand={category.brand} colored className="size-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{category.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {category.description}
                  </span>
                </span>
                <span className="ml-auto text-sm font-semibold tabular-nums text-muted-foreground">
                  {category.listingCount}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------- Trust & seller stats ------------------------- */}
      <section className="mt-20">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2">
          <div className="glass p-8">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10">
              <ShieldCheck className="size-5 text-primary" />
            </span>
            <h2 className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">
              Trust built into every transaction
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              From identity verification to escrow release, every order follows
              the same disciplined process.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                { icon: BadgeCheck, text: "Government-ID verification for every seller" },
                { icon: Lock, text: "Funds held in escrow until you confirm the transfer" },
                { icon: Gavel, text: "Independent dispute review with refund coverage" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <Icon className="size-4 shrink-0 text-primary" />
                  {text}
                </li>
              ))}
            </ul>
            <Button variant="outline" className="mt-6 rounded-xl" asChild>
              <Link to="/trust">
                Read our trust commitments <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="glass p-8">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-500/10">
              <ArrowRight className="size-5 text-emerald-400" />
            </span>
            <h2 className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">
              Sell to a market of serious buyers
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              List an established account in front of qualified buyers and keep
              92% of the sale price. Escrow means you ship with confidence too.
            </p>
            <dl className="mt-6 grid grid-cols-3 gap-4">
              {[
                { value: "3,120", label: "Top seller sales" },
                { value: "92%", label: "Revenue share" },
                { value: "<24h", label: "Payout speed" },
              ].map((s) => (
                <div key={s.label}>
                  <dd className="text-xl font-bold tabular-nums">{s.value}</dd>
                  <dt className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {s.label}
                  </dt>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button className="rounded-xl" asChild>
                <Link to="/auth?mode=register">
                  Start selling <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button variant="outline" className="rounded-xl" asChild>
                <Link to="/seller">Seller dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------- FAQ ------------------------------- */}
      <section className="mt-20">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <SectionHeading
            title="Frequently asked questions"
            subtitle="Everything buyers and sellers ask before their first transfer."
          />
          <div className="glass mt-6 px-6 py-2">
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
      </section>
    </div>
  );
}
