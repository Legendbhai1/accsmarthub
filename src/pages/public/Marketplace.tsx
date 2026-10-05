import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Bell, Heart, LayoutGrid, Search, X } from "lucide-react";
import { BrandMark } from "@/components/site/BrandMark";
import { MobileTabBar } from "@/components/site/MobileTabBar";
import { TopMenu } from "@/components/site/TopMenu";
import { formatPrice } from "@/lib/format";
import { categories } from "@/lib/db";
import { usePublicListings, type PublicListing } from "@/lib/supabaseQueries";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    chip: "Sale",
    title: "Verified Accounts",
    subtitle: "Escrow on every transfer / 30-day dispute cover",
    brand: "instagram",
  },
  {
    chip: "Hot",
    title: "Trending Niches",
    subtitle: "Fitness, finance & lifestyle pages with real engagement",
    brand: "tiktok",
  },
  {
    chip: "New",
    title: "Monetized Channels",
    subtitle: "Revenue-ready YouTube & Twitch inventory",
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
    <article className="group rounded-2xl border border-border bg-card p-2 transition-shadow hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
      <div className="relative">
        <Link
          to={`/listing/${listing.id}`}
          className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-muted"
        >
          <BrandMark
            brand={listing.brand}
            block
            className="size-14 transition-transform duration-200 group-hover:scale-105"
          />
          <span className="absolute bottom-2 left-2 rounded-full bg-card/85 px-2 py-0.5 text-[10px] font-bold text-foreground backdrop-blur-sm">
            {listing.serviceCategory ?? listing.brand}
          </span>
          {listing.stock <= 3 && (
            <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
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
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-card text-foreground shadow-sm transition-transform active:scale-90"
        >
          <Heart className={cn("size-3.5", liked ? "fill-[#e8384f] text-[#e8384f]" : "text-foreground")} />
        </button>
      </div>

      <Link to={`/listing/${listing.id}`} className="mt-2 block px-0.5">
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
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 4500);
    return () => window.clearInterval(timer);
  }, []);

  const category = params.get("category");
  const search = (params.get("q") ?? "").trim();

  const active = useMemo(
    () => (listings ?? []).filter((l) => l.stock > 0),
    [listings],
  );

  const items = useMemo(() => {
    const needle = search.toLowerCase();
    return active.filter((l) => {
      if (category && (l.serviceCategory ?? l.brand) !== category) return false;
      if (!needle) return true;
      return (
        l.title.toLowerCase().includes(needle) ||
        (l.summary ?? "").toLowerCase().includes(needle) ||
        l.brand.toLowerCase().includes(needle)
      );
    });
  }, [active, category, search]);

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
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary">
              <svg viewBox="0 0 24 24" className="size-5 text-primary-foreground" fill="currentColor" aria-hidden="true">
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H14a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 6V5.5ZM4 12a2.5 2.5 0 0 1 2.5-2.5H18a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 12.5V12ZM4 18.5A2.5 2.5 0 0 1 6.5 16H14a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 18.5Z" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold leading-tight tracking-tight text-foreground">AccsMartHub</p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">Escrow-protected marketplace</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Search accounts"
              onClick={() => setSearchOpen((v) => !v)}
              className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-[0_6px_16px_-12px_rgba(0,0,0,0.6)] transition-colors hover:bg-muted"
            >
              {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
            </button>
            <Link
              to="/account/notifications"
              aria-label="Notifications"
              className="relative flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-[0_6px_16px_-12px_rgba(0,0,0,0.6)] transition-colors hover:bg-muted"
            >
              <Bell className="size-4" />
              <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-[#e8384f]" />
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
      </header>

      {/* ---------------------------- Promo banner ---------------------------- */}
      <section className="mt-5 px-4">
        <div className="mx-auto max-w-md">
          <div key={slide} className="relative overflow-hidden rounded-3xl bg-muted px-5 py-6">
            <span className="inline-flex rounded-full bg-card px-2.5 py-1 text-[10px] font-semibold text-foreground">
              {current.chip}
            </span>
            <h2 className="mt-3 text-[21px] font-bold leading-tight tracking-tight text-foreground">{current.title}</h2>
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
                  "flex size-14 items-center justify-center rounded-full border transition-colors",
                  !category ? "border-transparent bg-primary" : "border-border bg-card",
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
                      "flex size-14 items-center justify-center rounded-full border transition-colors",
                      activeCat ? "border-transparent bg-primary" : "border-border",
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
                  : search || category
                    ? "No accounts match this search yet."
                    : "No accounts are listed right now. Check back soon."}
              </p>
              {(search || category) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    navigate("/marketplace", { replace: true });
                  }}
                  className="mt-4 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground"
                >
                  View all accounts
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {items.map((listing) => (
                <AccountCard
                  key={listing.id}
                  listing={listing}
                  liked={saved.includes(listing.id)}
                  onToggleLike={(id) =>
                    setSaved((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                  }
                />
              ))}
            </div>
          )}

          {/* Sell CTA */}
          <div className="ink-panel mt-8 px-5 py-5 text-center">
            <p className="text-sm font-semibold">Want to sell an account?</p>
            <p className="mt-1 text-[11px] leading-snug opacity-70">
              Apply to sell, then list accounts that go live in the marketplace.
            </p>
            <Link
              to="/seller/apply"
              className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground"
            >
              Apply to sell
            </Link>
          </div>
        </div>
      </main>

      {/* -------------------------- Floating bottom nav --------------------------
          The shared bar. The old local copy had five controls — a shopping bag
          pointing at /account/purchased next to a person icon pointing at
          /account — and swapped for a completely different set once you
          entered the account area. Now every screen shows the same four
          buttons, with no duplicated account icon. */}
      <MobileTabBar />
    </div>
  );
}