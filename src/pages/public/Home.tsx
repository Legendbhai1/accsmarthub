import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/site/BrandMark";
import { ListingCard } from "@/components/common/ListingCard";
import { SectionHeading } from "@/components/common/Primitives";
import { categories, useDb } from "@/lib/db";

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export default function Home() {
  const navigate = useNavigate();
  const { listings } = useDb();
  const [query, setQuery] = useState("");

  const active = listings.filter((l) => l.status === "active");
  const featured = [...active].sort((a, b) => b.rating - a.rating).slice(0, 8);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/marketplace?q=${encodeURIComponent(q)}` : "/marketplace");
  };

  return (
    <div className="overflow-x-clip">
      {/* ------------------------------ Hero ------------------------------ */}
      <section className="relative">
        {/* Ambient floating orbs */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="animate-orb-a absolute -top-24 left-[8%] size-80 rounded-full bg-primary/25 blur-3xl" />
          <div className="animate-orb-b absolute -top-10 right-[4%] size-96 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="animate-orb-a absolute top-56 left-[42%] size-64 rounded-full bg-sky-400/15 blur-3xl" />
        </div>

        <motion.section
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="mx-auto w-full max-w-3xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28"
        >
          <motion.div
            variants={cardVariants}
          >
            <Badge
              variant="secondary"
              className="mb-6 gap-1.5 rounded-full border-border/60 bg-background/70 px-3.5 py-1.5 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur"
            >
              <ShieldCheck className="size-3.5 text-primary" />
              Escrow-protected transfers on every order
            </Badge>
          </motion.div>

          <motion.h1
            variants={cardVariants}
            className="text-4xl font-bold leading-[1.06] tracking-tight sm:text-6xl"
          >
            Buy &amp; sell social media accounts,{" "}
            <span className="text-gradient">without the risk</span>
          </motion.h1>

          <motion.p
            variants={cardVariants}
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Verified sellers, documented ownership, and escrow that releases
            only when the deal is done.
          </motion.p>

          <motion.form
            variants={cardVariants}
            onSubmit={submitSearch}
            role="search"
            className="mx-auto mt-9 max-w-xl"
          >
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
                  className="inset-well h-12 w-full rounded-2xl bg-background/80 pl-11 pr-4 text-sm outline-none backdrop-blur placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60"
                />
              </div>
              <Button type="submit" size="lg" className="rounded-2xl">
                Search
              </Button>
            </div>
          </motion.form>
        </motion.section>
      </section>

      {/* --------------------------- Categories --------------------------- */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={containerVariants}
        className="mx-auto w-full max-w-7xl px-4 sm:px-6"
      >
        <motion.div variants={cardVariants}>
          <SectionHeading
            title="Browse by platform"
            subtitle="Each platform has a vetted roster of listings."
          />
        </motion.div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((category) => (
            <motion.div key={category.slug} variants={cardVariants}>
              <Link
                to={`/marketplace?category=${category.slug}`}
                className="glass glass-hover group flex flex-col p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <BrandMark
                  brand={category.brand}
                  block
                  className="size-10 transition-transform duration-200 group-hover:scale-110"
                />
                <h3 className="mt-4 text-sm font-semibold tracking-tight">
                  {category.name}
                </h3>
                <p className="mt-3 text-xs font-medium text-primary/90">
                  {category.listingCount.toLocaleString()} listings
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ------------------------- Featured listings ------------------------ */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={containerVariants}
        className="mt-20"
      >
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <motion.div variants={cardVariants}>
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
          </motion.div>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((listing) => (
              <motion.div key={listing.id} variants={cardVariants}>
                <ListingCard listing={listing} />
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ------------------------------- CTA ------------------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto mt-20 w-full max-w-7xl px-4 pb-20 sm:px-6"
      >
        <div className="ink-panel relative overflow-hidden px-6 py-12 text-center sm:py-16">
          {/* Floating accents inside the dark panel */}
          <div
            aria-hidden="true"
            className="animate-orb-a pointer-events-none absolute -left-16 -top-16 size-64 rounded-full bg-violet-400/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="animate-orb-b pointer-events-none absolute -bottom-20 -right-10 size-72 rounded-full bg-sky-400/20 blur-3xl"
          />

          <h2 className="relative text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to make your first transfer?
          </h2>
          <p className="relative mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground/70">
            Create an account to buy with escrow — or list an account and keep
            92% of the sale price.
          </p>
          <div className="relative mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="rounded-xl bg-white text-foreground hover:bg-white/90" asChild>
              <Link to="/auth?mode=register">Get started</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-xl border-white/25 bg-transparent text-foreground hover:bg-white/10 hover:text-foreground"
              asChild
            >
              <Link to="/trust">How escrow works</Link>
            </Button>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
