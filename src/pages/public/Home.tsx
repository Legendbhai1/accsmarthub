import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, Gavel, LockKeyhole, Search, ShieldCheck } from "lucide-react";
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
      <section className="relative overflow-hidden">
        {/* Three layers behind the copy: a faint grid for texture, a
            multi-hue brand wash, and two drifting colour orbs. All three are
            decorative and all three are neutralised by the reduced-motion
            block in index.css. */}
        <div aria-hidden="true" className="grid-veil pointer-events-none absolute inset-0" />
        <div
          aria-hidden="true"
          className="brand-wash pointer-events-none absolute inset-0"
        />
        <div
          aria-hidden="true"
          className="orb animate-float left-[-6rem] top-[-4rem] size-80"
          style={{ ["--orb" as string]: "var(--primary)" }}
        />
        <div
          aria-hidden="true"
          className="orb animate-float-slow right-[-5rem] top-8 size-72"
          style={{ ["--orb" as string]: "var(--brand-2)" }}
        />
        <div
          aria-hidden="true"
          className="orb animate-float-slow bottom-[-6rem] left-1/3 size-72"
          style={{ ["--orb" as string]: "var(--pop-cyan)" }}
        />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="relative mx-auto w-full max-w-3xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28"
        >
          <motion.div variants={cardVariants}>
            <Badge
              variant="secondary"
              className="mb-6 gap-1.5 rounded-lg border border-primary/20 bg-card px-3.5 py-1.5 text-xs font-semibold text-primary shadow-sm"
            >
              <span className="relative flex size-2">
                <span className="animate-pulse-glow absolute inline-flex size-full rounded-full bg-success" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              Reviewed listings, payment held in-platform
            </Badge>
          </motion.div>

          <motion.h1
            variants={cardVariants}
            className="font-display text-4xl leading-[1.06] sm:text-6xl"
          >
            Buy &amp; sell social media accounts,{" "}
            <span className="text-gradient">without the risk</span>
          </motion.h1>

          <motion.p
            variants={cardVariants}
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Every listing is reviewed by an admin before it goes live, and your
            payment is held in-platform until you confirm the transfer.
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
            <div className="flex gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-lg shadow-primary/10 transition-shadow duration-200 focus-within:shadow-primary/20">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="hero-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Try “fitness TikTok 300K” or “monetized YouTube”"
                  className="h-11 w-full rounded-xl bg-transparent pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Button type="submit" size="lg" className="rounded-xl px-7">
                Search
              </Button>
            </div>
          </motion.form>

          {/* The three commitments, each on its own hue so the row is not a
              wall of violet. */}
          <motion.ul
            variants={cardVariants}
            className="mx-auto mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm"
          >
            {[
              { icon: ShieldCheck, tint: "var(--pop-green)", label: "Admin-reviewed listings" },
              { icon: LockKeyhole, tint: "var(--primary)", label: "Funds held in-platform" },
              { icon: Gavel, tint: "var(--pop-orange)", label: "Dispute review by admins" },
            ].map(({ icon: Icon, tint, label }) => (
              <li key={label} className="flex items-center gap-2 font-medium">
                <span
                  className="icon-tile size-7"
                  style={{ ["--tile" as string]: tint }}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="text-muted-foreground">{label}</span>
              </li>
            ))}
          </motion.ul>
        </motion.div>
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
                className="surface card-hover group flex flex-col p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <BrandMark
                  brand={category.brand}
                  block
                  className="size-11 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
                />
                <h3 className="mt-4 text-sm font-bold tracking-tight">
                  {category.name}
                </h3>
                <p className="mt-2 text-xs font-medium text-muted-foreground">
                  {countFor(category.brand) === 0
                    ? "No live listings yet"
                    : `${countFor(category.brand)} ${
                        countFor(category.brand) === 1 ? "listing" : "listings"
                      } available`}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  Browse <ArrowRight className="size-3" />
                </span>
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
              subtitle="The newest accounts approved by our review team."
              action={
                <Button variant="ghost" className="hidden sm:inline-flex" asChild>
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
            <div className="surface mt-6 px-6 py-16 text-center">
              <p className="font-semibold">No live listings yet</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
                Every listing is reviewed by an admin before it goes live.
                Check back shortly, or list an account of your own.
              </p>
              <Button className="mt-5" asChild>
                <Link to="/seller/listings?new=1">Start selling</Link>
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
        <div className="ink-panel brand-gradient-animated relative overflow-hidden border-transparent px-6 py-12 text-center text-primary-foreground sm:py-16">
          {/* Decorative colour behind the copy: a soft white bloom plus two
              dark orbs, so the gradient panel has depth instead of a flat
              fill. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_50%_0%,hsl(0_0%_100%/0.22),transparent_60%)]"
          />
          <span
            aria-hidden="true"
            className="orb animate-float right-[-4rem] top-[-3rem] size-64 opacity-40"
            style={{ ["--orb" as string]: "var(--pop-cyan)" }}
          />
          <span
            aria-hidden="true"
            className="orb animate-float-slow bottom-[-5rem] left-[-3rem] size-64 opacity-40"
            style={{ ["--orb" as string]: "var(--pop-orange)" }}
          />
          <h2 className="relative text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to make your first transfer?
          </h2>
          <p className="relative mx-auto mt-3 max-w-md text-sm leading-relaxed text-primary-foreground/85">
            Create an account to buy with payment held in-platform until you
            confirm — or list an account and keep 90% of the sale price.
          </p>
          <div className="relative mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="sheen bg-card px-7 font-semibold text-foreground hover:bg-secondary"
              asChild>
              <Link to="/auth?mode=register">Get started</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-primary-foreground/40 bg-transparent px-7 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              asChild
            >
              <Link to="/trust">How payment protection works</Link>
            </Button>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
