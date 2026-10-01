import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  Bell,
  Heart,
  Home,
  LayoutGrid,
  Search,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { useDb, categories, type Listing } from "@/lib/db";
import { cn } from "@/lib/utils";

function formatFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

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
  listing: Listing;
  liked: boolean;
  onToggleLike: (id: string) => void;
}) {
  return (
    <article className="group rounded-2xl border border-black/5 bg-white p-2 transition-shadow hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
      <div className="relative">
        <Link
          to={`/listing/${listing.id}`}
          className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-[#eceef0]"
        >
          <BrandMark
            brand={listing.brand}
            block
            className="size-14 transition-transform duration-200 group-hover:scale-105"
          />
          <span className="absolute bottom-2 left-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold text-black backdrop-blur-sm">
            {formatFollowers(listing.followers)} followers
          </span>
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
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-white text-black shadow-sm transition-transform active:scale-90"
        >
          <Heart className={cn("size-3.5", liked ? "fill-[#e8384f] text-[#e8384f]" : "text-black")} />
        </button>
      </div>

      <Link to={`/listing/${listing.id}`} className="mt-2 block px-0.5">
        <h3 className="truncate text-[13px] font-semibold tracking-tight text-black">{listing.title}</h3>
        <p className="mt-0.5 truncate text-[11px] text-gray-500">
          {listing.niche} · ★ {listing.rating.toFixed(1)}
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold tracking-tight text-black">{formatPrice(listing.price)}</span>
          {listing.oldPrice && (
            <span className="text-[11px] text-gray-400 line-through">{formatPrice(listing.oldPrice)}</span>
          )}
        </div>
      </Link>
    </article>
  );
}

export default function Marketplace() {
  const { listings, orders } = useDb();
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
    () => listings.filter((l) => l.status === "active" && l.stock > 0),
    [listings],
  );

  const items = useMemo(() => {
    const needle = search.toLowerCase();
    return active.filter((l) => {
      if (category && l.category !== category) return false;
      if (!needle) return true;
      return (
        l.title.toLowerCase().includes(needle) ||
        l.niche.toLowerCase().includes(needle) ||
        l.brand.toLowerCase().includes(needle)
      );
    });
  }, [active, category, search]);

  const cartCount = orders.filter((o) => o.buyerId === "u-me").length;

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
    <div className="relative min-h-screen bg-white pb-32">
      {/* ---------------------------- App header ---------------------------- */}
      <header className="px-4 pt-5">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#15172b]">
              <svg viewBox="0 0 24 24" className="size-5 text-white" fill="currentColor" aria-hidden="true">
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H14a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 6V5.5ZM4 12a2.5 2.5 0 0 1 2.5-2.5H18a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 12.5V12ZM4 18.5A2.5 2.5 0 0 1 6.5 16H14a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 18.5Z" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold leading-tight tracking-tight text-black">AccsMartHub</p>
              <p className="truncate text-[11px] leading-tight text-gray-500">Escrow-protected marketplace</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Search accounts"
              onClick={() => setSearchOpen((v) => !v)}
              className="flex size-10 items-center justify-center rounded-full border border-black/5 bg-white text-black shadow-[0_6px_16px_-12px_rgba(0,0,0,0.6)] transition-colors hover:bg-gray-50"
            >
              {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
            </button>
            <Link
              to="/account/notifications"
              aria-label="Notifications"
              className="relative flex size-10 items-center justify-center rounded-full border border-black/5 bg-white text-black shadow-[0_6px_16px_-12px_rgba(0,0,0,0.6)] transition-colors hover:bg-gray-50"
            >
              <Bell className="size-4" />
              <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-[#e8384f]" />
            </Link>
          </div>
        </div>

        {searchOpen && (
          <form onSubmit={submitSearch} role="search" className="mx-auto mt-4 max-w-md">
            <label htmlFor="marketplace-search" className="sr-only">
              Search social media accounts
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <input
                id="marketplace-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search accounts, niches, platforms…"
                className="h-11 w-full rounded-full border border-black/5 bg-[#f5f6f7] pl-11 pr-4 text-sm text-black outline-none placeholder:text-gray-400 focus:border-black/10 focus:bg-white"
              />
            </div>
          </form>
        )}
      </header>

      {/* ---------------------------- Promo banner ---------------------------- */}
      <section className="mt-5 px-4">
        <div className="mx-auto max-w-md">
          <div key={slide} className="relative overflow-hidden rounded-3xl bg-[#eceef0] px-5 py-6">
            <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-black">
              {current.chip}
            </span>
            <h2 className="mt-3 text-[21px] font-bold leading-tight tracking-tight text-black">{current.title}</h2>
            <p className="mt-1 max-w-[62%] text-[11px] leading-snug text-gray-600">{current.subtitle}</p>
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
                  i === slide ? "w-4 bg-black" : "bg-gray-300",
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
                  !category ? "border-black bg-black" : "border-black/5 bg-white",
                )}
              >
                <LayoutGrid className={cn("size-5", !category ? "text-white" : "text-black")} />
              </span>
              <span className="text-[11px] text-black">All</span>
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
                      activeCat ? "border-black" : "border-black/5",
                    )}
                  >
                    <BrandMark brand={c.brand} colored className="size-6" />
                  </span>
                  <span className={cn("text-[11px]", activeCat ? "font-semibold text-black" : "text-black")}>
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
            <h2 className="text-[19px] font-bold tracking-tight text-black">New arrivals</h2>
            <span className="text-[11px] text-gray-500">
              {items.length} {items.length === 1 ? "account" : "accounts"}
            </span>
          </div>

          {items.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-black/5 px-6 py-12 text-center">
              <p className="text-sm text-gray-600">No accounts match this search yet.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  navigate("/marketplace", { replace: true });
                }}
                className="mt-4 rounded-full bg-black px-5 py-2 text-xs font-semibold text-white"
              >
                View all accounts
              </button>
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
          <div className="mt-8 rounded-2xl bg-[#15172b] px-5 py-5 text-center">
            <p className="text-sm font-semibold text-white">Want to sell an account?</p>
            <p className="mt-1 text-[11px] leading-snug text-white/60">
              Apply to sell, then list accounts that go live in the marketplace.
            </p>
            <Link
              to="/seller/apply"
              className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-white px-5 text-xs font-semibold text-black"
            >
              Apply to sell
            </Link>
          </div>
        </div>
      </main>

      {/* -------------------------- Floating bottom nav -------------------------- */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4"
      >
        <div className="flex w-full max-w-md items-center justify-between rounded-full border border-black/5 bg-white px-2 py-2 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.5)]">
          <Link
            to="/"
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-2 transition-colors",
              location.pathname === "/" ? "bg-black" : "hover:bg-gray-50",
            )}
          >
            <Home className={cn("size-4", location.pathname === "/" ? "text-white" : "text-black")} />
            <span className={cn("text-xs font-semibold", location.pathname === "/" ? "text-white" : "text-black")}>
              Home
            </span>
          </Link>

          <Link
            to="/marketplace"
            aria-label="Marketplace"
            className={cn(
              "flex size-9 items-center justify-center rounded-full transition-colors",
              location.pathname === "/marketplace" ? "bg-black" : "hover:bg-gray-50",
            )}
          >
            <LayoutGrid className={cn("size-4", location.pathname === "/marketplace" ? "text-white" : "text-black")} />
          </Link>

          <Link
            to="/account/purchased"
            aria-label="Purchased accounts"
            className="relative flex size-9 items-center justify-center rounded-full transition-colors hover:bg-gray-50"
          >
            <ShoppingBag className="size-4 text-black" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-black text-[9px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </Link>

          <Link
            to="/account"
            aria-label="Account"
            className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-gray-50"
          >
            <User className="size-4 text-black" />
          </Link>
        </div>
      </nav>
    </div>
  );
}