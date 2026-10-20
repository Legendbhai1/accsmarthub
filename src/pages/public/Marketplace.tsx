import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Bell, Heart, LayoutGrid, Search, X } from "lucide-react";
import { BrandMark } from "@/components/site/BrandMark";
import { TopMenu } from "@/components/site/TopMenu";
import { Pagination } from "@/components/common/Pagination";
import { formatPrice } from "@/lib/format";
import { categories } from "@/lib/db";
import { usePublicListings, useSavedListingIds, type PublicListing } from "@/lib/supabaseQueries";
import { toggleSavedListing, publicAssetUrl } from "@/lib/supabaseMutations";
import { useSession } from "@/lib/session";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    chip: "Sale",
    title: "Browse the Marketplace",
    subtitle: "Every listing moderated before it goes live",
    brand: "instagram",
  },
  {
    chip: "Hot",
    title: "Trending Niches",
    subtitle: "Fitness, finance & lifestyle pages",
    brand: "tiktok",
  },
  {
    chip: "New",
    title: "Monetized Channels",
    subtitle: "YouTube & Twitch inventory from live listings",
    brand: "youtube",
  },
];

function AccountCard({
  listing,
  liked,
  onToggleLike,
}: {
  listing: PublicListing;
  liked: boolean;
  onToggleLike: (id: string) => void;
}) {
  return (
    // Translucent, not blurred: this grid can hold dozens of cards, and a
    // backdrop-filter per card is what makes a long list stutter on a phone.
    <article className="group rounded-3xl border border-border/70 bg-card/70 p-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_16px_34px_-20px_rgba(0,0,0,0.5)]">
      <div className="relative">
        <Link
          to={`/marketplace/${listing.id}`}
          className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-muted"
        >
          {listing.imagePath ? (
            <img
              src={publicAssetUrl("listing-assets", listing.imagePath)}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <BrandMark
              brand={listing.brand}
              block
              className="size-14 transition-transform duration-200 group-hover:scale-105"
            />
          )}
          <span className="absolute bottom-2 left-2 rounded-md bg-card/90 px-2 py-0.5 text-[10px] font-bold text-foreground">
            {listing.serviceCategory ?? listing.brand}
          </span>
          {listing.stock <= 3 && (
            <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              {listing.stock === 0 ? "Sold out" : `Only ${listing.stock} left`}
            </span>
          )}
        </Link>
        <button
          type="button"
          aria-label={liked ? "Remove from saved" : "Save account"}
          aria-pressed={liked}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleLike(listing.id);
          }}
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-lg bg-card text-foreground shadow-sm transition-colors duration-150"
        >
          <Heart className={cn("size-3.5", liked ? "fill-destructive text-destructive" : "text-foreground")} />
        </button>
      </div>

      <Link to={`/marketplace/${listing.id}`} className="mt-2 block px-0.5">
        <h3 className="truncate text-[13px] font-semibold tracking-tight text-foreground">{listing.title}</h3>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {listing.serviceCategory ?? listing.brand}
          {listing.warrantyHours != null && listing.warrantyHours > 0
            ? ` · ${listing.warrantyHours}h warranty`
            : ""}
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            {formatPrice(listing.priceUsd)}
          </span>
          {listing.discountPercent != null && listing.discountPercent > 0 && (
            <span className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
              -{listing.discountPercent}%
            </span>
          )}
          <span className="ml-auto text-[10px] font-semibold text-muted-foreground">
            {listing.stock} in stock
          </span>
        </div>
      </Link>
    </article>
  );
}

export default function Marketplace() {
  const { data: listings, loading, error } = usePublicListings();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [searchOpen, setSearchOpen] = useState(Boolean(params.get("q")));
  const [slide, setSlide] = useState(0);

  const { user } = useSession();
  const savedQuery = useSavedListingIds();
  // Optimistic set so the heart fills on tap; the database is the source of
  // truth and is re-read after each write.
  const [saved, setSaved] = useState<string[] | null>(null);
  const savedIds = useMemo(
    () => new Set(saved ?? savedQuery.data ?? []),
    [saved, savedQuery.data],
  );

  const toggleSaved = async (id: string) => {
    if (!user) {
      toast.error("Sign in to save accounts", {
        description: "Saved accounts are kept with your account.",
      });
      navigate("/auth?next=/marketplace");
      return;
    }
    const isSaved = savedIds.has(id);
    setSaved(
      (prev) => {
        const base = prev ?? savedQuery.data ?? [];
        return isSaved ? base.filter((x) => x !== id) : [...base, id];
      },
    );
    try {
      await toggleSavedListing(id, !isSaved);
      savedQuery.refresh();
    } catch (err) {
      // Put the heart back: the write did not land.
      setSaved(
        (prev) => {
          const base = prev ?? savedQuery.data ?? [];
          return isSaved ? [...base, id] : base.filter((x) => x !== id);
        },
      );
      toast.error("Could not update your saved accounts", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 4500);
    return () => window.clearInterval(timer);
  }, []);

  const category = params.get("category");
  const search = (params.get("q") ?? "").trim();
  const sort = params.get("sort") ?? "newest";
  const minPrice = params.get("min") ?? "";
  const maxPrice = params.get("max") ?? "";

  const active = useMemo(
    () => (listings ?? []).filter((l) => l.stock > 0),
    [listings],
  );

  const items = useMemo(() => {
    const needle = search.toLowerCase();
    const lo = minPrice.trim() === "" ? null : Number(minPrice);
    const hi = maxPrice.trim() === "" ? null : Number(maxPrice);

    const matched = active.filter((l) => {
      if (category && (l.serviceCategory ?? l.brand) !== category) return false;
      // Availability is part of the filter set, not just the default view: a
      // shopper who opens "all" should still not see a sold-out listing.
      if (l.stock <= 0) return false;
      if (lo !== null && Number.isFinite(lo) && l.priceUsd < lo) return false;
      if (hi !== null && Number.isFinite(hi) && l.priceUsd > hi) return false;
      if (!needle) return true;
      return (
        l.title.toLowerCase().includes(needle) ||
        (l.summary ?? "").toLowerCase().includes(needle) ||
        l.brand.toLowerCase().includes(needle)
      );
    });

    // Sort on the fields the listing actually exposes. `newest` keeps the
    // server's created_at ordering, so no client-side sort is applied.
    const sorted = [...matched];
    if (sort === "price_asc") sorted.sort((a, b) => a.priceUsd - b.priceUsd);
    else if (sort === "price_desc") sorted.sort((a, b) => b.priceUsd - a.priceUsd);
    else if (sort === "discount")
      sorted.sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
    return sorted;
  }, [active, category, search, sort, minPrice, maxPrice]);

  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  // A filter change can leave the current page past the end of the new result
  // set, so clamp rather than showing an empty grid.
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [items, safePage],
  );

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    setPage(1);
    navigate(qs ? `/marketplace?${qs}` : "/marketplace", { replace: true });
  };

  // Previously a count of seeded demo orders. The catalogue is live now; the
  // cart badge only reflects rows this browser has actually started.
  const goCategory = (slug: string | null) => {
    const next = new URLSearchParams(location.search);
    if (slug) next.set("category", slug);
    else next.delete("category");
    const qs = next.toString();
    navigate(qs ? `/marketplace?${qs}` : "/marketplace", { replace: true });
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(location.search);
    const q = query.trim();
    if (q) next.set("q", q);
    else next.delete("q");
    const qs = next.toString();
    navigate(qs ? `/marketplace?${qs}` : "/marketplace", { replace: true });
    setSearchOpen(false);
  };

  const current = SLIDES[slide];

  return (
    <div className="relative min-h-screen bg-background pb-32">
      {/* ---------------------------- App header ---------------------------- */}
      <header className="px-4 pt-5">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary">
              <svg viewBox="0 0 24 24" className="size-5 text-primary-foreground" fill="currentColor" aria-hidden="true">
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H14a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 6V5.5ZM4 12a2.5 2.5 0 0 1 2.5-2.5H18a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 12.5V12ZM4 18.5A2.5 2.5 0 0 1 6.5 16H14a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 18.5Z" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold leading-tight tracking-tight text-foreground">AccsMartHub</p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">Reviewed marketplace</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Search accounts"
              onClick={() => setSearchOpen((v) => !v)}
              className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors duration-150 hover:bg-accent"
            >
              {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
            </button>
            <Link
              to="/account/notifications"
              aria-label="Notifications"
              className="relative flex size-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors duration-150 hover:bg-accent"
            >
              <Bell className="size-4" />
              <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-destructive" />
            </Link>
            {/* Three-line menu: become a seller / dark-light switch. */}
            <TopMenu />
          </div>
        </div>

        {searchOpen && (
          <form onSubmit={submitSearch} role="search" className="mx-auto mt-4 max-w-md">
            <label htmlFor="marketplace-search" className="sr-only">
              Search social media accounts
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="marketplace-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search accounts, niches, platforms…"
                className="inset-well h-11 w-full pl-11 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60"
              />
            </div>
          </form>
        )}

        {/* The page's one `h1`. The header above carries the wordmark only, so
            before this the document had no top-level heading at all and a
            screen reader announced the page by its `<title>` alone. */}
        <div className="mx-auto mt-5 max-w-md">
          <h1 className="page-title">Marketplace</h1>
          <p className="page-sub mt-1">
            Every account here was reviewed by an admin before it went live.
          </p>
        </div>
      </header>

      {/* ---------------------------- Promo banner ---------------------------- */}
      <section className="mt-5 px-4">
        <div className="mx-auto max-w-md">
          <div
            key={slide}
            className="relative overflow-hidden rounded-2xl border border-border bg-secondary px-5 py-6"
          >
            <span className="inline-flex rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
              {current.chip}
            </span>
            {/* A `<p>`, not a heading: this rotates between marketing slides,
                so as an `h2` it inserted a section that had nothing to do with
                the page outline and appeared above the real listings heading. */}
            <p className="mt-3 text-[21px] font-bold leading-tight tracking-tight text-foreground">
              {current.title}
            </p>
            <p className="mt-1 max-w-[62%] text-[11px] leading-snug text-muted-foreground">{current.subtitle}</p>
            <BrandMark
              brand={current.brand}
              block
              className="absolute -right-3 bottom-2 size-24 rotate-[-12deg] opacity-90"
            />
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                aria-label={`Show ${s.title}`}
                aria-current={i === slide}
                onClick={() => setSlide(i)}
                className={cn(
                  "size-1.5 rounded-full transition-all",
                  i === slide ? "w-4 bg-primary" : "bg-border",
                )}
              />
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- Category circles --------------------------- */}
      <section className="mt-6">
        <div
          className="flex gap-4 overflow-x-auto px-4 pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="mx-auto flex w-max max-w-md gap-4">
            <button
              type="button"
              onClick={() => goCategory(null)}
              className="flex w-14 shrink-0 flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  "flex size-14 items-center justify-center rounded-xl border transition-colors duration-150",
                  !category
                    ? "border-transparent bg-primary"
                    : "border-border bg-card",
                )}
              >
                <LayoutGrid className={cn("size-5", !category ? "text-primary-foreground" : "text-foreground")} />
              </span>
              <span className="text-[11px] text-foreground">All</span>
            </button>
            {categories.map((c) => {
              const activeCat = category === c.slug;
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => goCategory(activeCat ? null : c.slug)}
                  className="flex w-14 shrink-0 flex-col items-center gap-1.5"
                >
                  <span
                    className={cn(
                      "flex size-14 items-center justify-center rounded-xl border transition-colors duration-150",
                      activeCat
                        ? "border-transparent bg-primary"
                        : "border-border/70 bg-card/70",
                    )}
                  >
                    <BrandMark brand={c.brand} colored className="size-6" />
                  </span>
                  <span className={cn("text-[11px]", activeCat ? "font-semibold text-foreground" : "text-foreground")}>
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------ Listings ------------------------------ */}
      <main className="mt-7 px-4">
        <div className="mx-auto max-w-md">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[19px] font-bold tracking-tight text-foreground">New arrivals</h2>
            <span className="text-[11px] text-muted-foreground">
              {loading
                ? "Loading…"
                : `${items.length} ${items.length === 1 ? "account" : "accounts"}`}
            </span>
          </div>

          {/* Filters live in the URL so a filtered view is shareable and the
              back button behaves. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="sort">
              Sort listings
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => updateParam("sort", e.target.value === "newest" ? "" : e.target.value)}
              className="inset-well h-9 rounded-lg px-3 text-xs outline-none focus:ring-2 focus:ring-ring/30"
            >
              <option value="newest">Newest first</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="discount">Biggest discount</option>
            </select>
            <label className="sr-only" htmlFor="min-price">
              Minimum price
            </label>
            <input
              id="min-price"
              type="number"
              min={0}
              inputMode="numeric"
              value={minPrice}
              onChange={(e) => updateParam("min", e.target.value)}
              placeholder="Min $"
              className="inset-well h-9 w-24 rounded-lg px-3 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30"
            />
            <label className="sr-only" htmlFor="max-price">
              Maximum price
            </label>
            <input
              id="max-price"
              type="number"
              min={0}
              inputMode="numeric"
              value={maxPrice}
              onChange={(e) => updateParam("max", e.target.value)}
              placeholder="Max $"
              className="inset-well h-9 w-24 rounded-lg px-3 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30"
            />
            {(minPrice || maxPrice || sort !== "newest") && (
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(location.search);
                  next.delete("min");
                  next.delete("max");
                  next.delete("sort");
                  const qs = next.toString();
                  setPage(1);
                  navigate(qs ? `/marketplace?${qs}` : "/marketplace", { replace: true });
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                Clear filters
              </button>
            )}
          </div>

          {error ? (
            <div className="mt-10 rounded-2xl border border-destructive/20 bg-destructive/5 px-6 py-12 text-center">
              <p className="text-sm font-semibold text-destructive">
                Could not load the catalogue.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-border px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {loading
                  ? "Loading accounts…"
                  : search || category || minPrice || maxPrice
                    ? "No accounts match this search yet."
                    : "No accounts are listed right now. Check back soon."}
              </p>
              {(search || category || minPrice || maxPrice) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setPage(1);
                    navigate("/marketplace", { replace: true });
                  }}
                  className="mt-4 rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground"
                >
                  View all accounts
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {paged.map((listing) => (
                  <AccountCard
                    key={listing.id}
                    listing={listing}
                    liked={savedIds.has(listing.id)}
                    onToggleLike={toggleSaved}
                  />
                ))}
              </div>
              <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
            </>
          )}

          {/* Sell CTA */}
          <div className="ink-panel mt-8 px-5 py-5 text-center">
            <p className="text-sm font-semibold">Want to sell an account?</p>
            <p className="mt-1 text-[11px] leading-snug opacity-70">
              Create a listing in minutes — it goes live once an admin approves
              it.
            </p>
            <Link
              to="/seller/listings?new=1"
              className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground"
            >
              Start selling
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}