import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/site/BrandMark";
import { SectionHeading } from "@/components/common/Primitives";
import { categories } from "@/lib/db";
import { usePublicListings } from "@/lib/supabaseQueries";

/**
 * /categories — the full platform directory.
 *
 * Counts are the number of listings a seller has actually stocked and had
 * approved, read live from the server. `usePublicListings` already filters to
 * `status = 'active'`, not hidden, and in stock, so every row counted here has
 * been through admin review. A platform with nothing approved yet says so
 * plainly rather than advertising a made-up total.
 */
export default function Categories() {
  const { data: listings = [] } = usePublicListings();

  const isLive = (brand: string) =>
    listings.filter((listing) => listing.brand === brand);

  return (
    <div className="overflow-x-clip">
      <section className="mx-auto w-full max-w-7xl px-4 pb-10 pt-16 sm:px-6 sm:pt-20">
        <SectionHeading
          title="Browse by platform"
          subtitle="Every account on AccsMartHub belongs to one of these ecosystems. Pick a platform to see what is live right now."
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const live = isLive(category.brand);
            return (
              <Link
                key={category.slug}
                to={`/marketplace?category=${category.slug}`}
                className="surface transition-colors hover:border-primary/40 group flex flex-col p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <div className="flex items-center gap-3">
                  <BrandMark
                    brand={category.brand}
                    block
                    className="size-11 transition-transform duration-200 group-hover:scale-110"
                  />
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight">
                      {category.name}
                    </h3>
                    <p className="text-xs font-medium text-muted-foreground">
                      {live.length === 0
                        ? "No live listings yet"
                        : `${live.length} ${
                            live.length === 1 ? "listing" : "listings"
                          } available`}
                    </p>
                  </div>
                  <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {category.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">
        <div className="surface flex flex-wrap items-center justify-between gap-4 px-6 py-7">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              Not seeing your platform?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Any member can list an account they can document ownership of —
              no store setup first. Every listing is reviewed by an admin
              before it appears here.
            </p>
          </div>
          <Button className="rounded-full" asChild>
            <Link to="/seller/listings?new=1">Start selling</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
