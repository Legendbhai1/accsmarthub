import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/site/BrandMark";
import { ListingCard } from "@/components/common/ListingCard";
import { SectionHeading } from "@/components/common/Primitives";
import { categories } from "@/lib/db";
import { usePublicListings } from "@/lib/supabaseQueries";

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
  const { data: listings = [] } = usePublicListings();
  const [query, setQuery] = useState("");

  // `usePublicListings` already filters to active, non-hidden, in-stock rows,
  // and carries live stock, so the landing page cannot advertise inventory
  // that cannot be bought.
  const featured = listings.slice(0, 8);
  // Real per-category counts of live inventory, never a seeded headline.
  const countFor = (brand: string) =>
    featured.filter((l) => l.brand === brand).length;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/marketplace?q=${encodeURIComponent(q)}` : "/marketplace");
  };

  return (
    <div className="overflow-x-clip">
      {/* ------------------------------ Hero ------------------------------ */}
      <section className="relative">
        {/* Ambient floating orbs — gold and violet, so they read in both themes */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="animate-orb-a absolute -top-24 left-[8%] size-80 rounded-full bg-amber-400/25 blur-3xl" />
          <div className="animate-orb-b absolute -top-10 right-[4%] size-96 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="animate-orb-a absolute top-56 left-[42%] size-64 rounded-full bg-violet-400/20 blur-3xl" />
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
              className="mb-6 gap-1.5 rounded-full border-amber-500/30 bg-amber-400/10 px-3.5 py-1.5 text-xs font-semibold text-amber-800 backdrop-blur dark:text-amber-300"
            >
              <ShieldCheck className="size-3.5" />
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
                  className="inset-well h-12 w-full rounded-full bg-background pl-11 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60"
                />
              </div>
              <Button type="submit" size="lg" className="rounded-full px-7">
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
                <p className="mt-3 text-xs font-medium text-muted-foreground">
                  {countFor(category.brand) === 0
                    ? "No live listings yet"
                    : `${countFor(category.brand)} ${
                        countFor(category.brand) === 1 ? "listing" : "listings"
                      } available`}
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
                <Button variant="ghost" className="hidden rounded-full sm:inline-flex" asChild>
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
          {featured.length === 0 && (
            <div className="glass mt-6 px-6 py-16 text-center">
              <p className="font-semibold">No live listings yet</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
                Every listing is published by an approved seller and starts
                pending moderation. Check back shortly, or apply to sell.
              </p>
              <Button className="mt-5 rounded-full" asChild>
                <Link to="/seller/apply">Apply to sell</Link>
              </Button>
            </div>
          )}
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
            className="animate-orb-a pointer-events-none absolute -left-16 -top-16 size-64 rounded-full bg-white/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="animate-orb-b pointer-events-none absolute -bottom-20 -right-10 size-72 rounded-full bg-white/[0.07] blur-3xl"
          />

          <h2 className="relative text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to make your first transfer?
          </h2>
          <p className="relative mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/70">
            Create an account to buy with escrow — or list an account and keep
            90% of the sale price.
          </p>
          <div className="relative mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 px-7 font-semibold text-amber-950 hover:from-amber-300 hover:to-amber-600"
              asChild
            >
              <Link to="/auth?mode=register">Get started</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full border-white/25 bg-transparent px-7 text-white/90 hover:bg-white/10 hover:text-white"
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
