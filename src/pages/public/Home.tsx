import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/site/BrandMark";
import { ListingCard } from "@/components/common/ListingCard";
import { SectionHeading } from "@/components/common/Primitives";
import { categories, useDb } from "@/lib/db";

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
    <div>
      {/* ------------------------------ Hero ------------------------------ */}
      <section className="mx-auto w-full max-w-3xl px-4 pb-14 pt-16 text-center sm:px-6 sm:pt-24">
        <Badge
          variant="secondary"
          className="mb-5 gap-1.5 rounded-full border-border/60 bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground"
        >
          <ShieldCheck className="size-3.5 text-primary" />
          Escrow-protected transfers on every order
        </Badge>
        <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          Buy &amp; sell social media accounts,{" "}
          <span className="text-gradient">without the risk</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Verified sellers, documented ownership, and escrow that releases only
          when the deal is done.
        </p>

        <form onSubmit={submitSearch} role="search" className="mx-auto mt-8 max-w-xl">
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
      </section>

      {/* --------------------------- Categories --------------------------- */}
      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <SectionHeading
          title="Browse by platform"
          subtitle="Each platform has a vetted roster of listings."
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
      <section className="mt-16">
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

      {/* ------------------------------- CTA ------------------------------- */}
      <section className="mx-auto mt-16 w-full max-w-7xl px-4 pb-16 sm:px-6">
        <div className="glass flex flex-col items-center gap-4 px-6 py-10 text-center">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            Ready to make your first transfer?
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Create an account to buy with escrow — or list an account and keep
            92% of the sale price.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="rounded-xl" asChild>
              <Link to="/auth?mode=register">Get started</Link>
            </Button>
            <Button variant="outline" className="rounded-xl" asChild>
              <Link to="/trust">How escrow works</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
