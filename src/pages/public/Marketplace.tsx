import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { Search, Bell, ShoppingBag } from "lucide-react";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { useDb, categories, type Listing } from "@/lib/db";
import { cn } from "@/lib/utils";

function formatFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

const RATING_STARS =
  "M9.833 3.75c.133-.155.217-.334.244-.53A8 8 0 0 0 8.574 2h-.01A9 9 0 0 0 4.136 4c-.027.196-.111.375-.244.53l-.612 1.318A9 9 0 0 1 .25 11.75v.004a8.01 8.01 0 0 0 3.045 6.46l.612-1.318c.133.155.217.334.244.53.033.23.061.46.085.69-.024-.23-.052-.46-.085-.69A9 9 0 0 1 .5 11.75V11.750000000000002a8.01 8.01 0 0 0 3.045-6.46L7.0 4.03c.133-.155.217-.334.244-.53A8 8 0 0 0 8.58 2h-.006A9 9 0 0 0 4.14 4c-.026.196-.11.375-.242.53L3.39 6.388A9 9 0 0 1 .275 11.75H.267A8.007 8.007 0 0 0 3.31 5.3A7.98 7.98 0 0 0 8.433 2h.015A8 8 0 0 0 8.58 2h.365A8 8 0 0 0 9.833 3.75Z";

function AccountCard({ listing }: { listing: Listing }) {
  return (
    <Link
      to={`/listing/${listing.id}`}
      className="group block rounded-2xl border border-gray-100 bg-white p-3 transition-shadow hover:shadow-sm"
    >
      {/* cover image area — brand tile on a soft neutral fill */}
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-[#f4f5f7] overflow-hidden">
        <BrandMark brand={listing.brand} block className="size-16 transition-transform duration-200 group-hover:scale-105" />
        <span className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-white/85 px-1 text-[10px] font-bold text-black shadow-sm backdrop-blur-sm">
          {formatFollowers(listing.followers)}
        </span>
      </div>

      {/* title + niche row */}
      <div className="mt-2.5">
        <h3 className="block truncate text-[13px] font-semibold text-black transition-colors group-hover:text-[#5b3def]">
          {listing.title}
        </h3>
        <div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
          <span className="truncate">{listing.niche}</span>
          <span className="shrink-0 font-semibold">★ {listing.rating.toFixed(1)}</span>
        </div>
      </div>

      {/* price + Buy pill row */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[17px] font-bold text-black">
          {formatPrice(listing.price)}
          <span className="text-[9px] text-gray-400">.00</span>
        </span>
        <span className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-black shadow-sm transition-colors hover:bg-black hover:text-white">
          Buy
        </span>
      </div>
    </Link>
  );
}

export default function Marketplace() {
  const { listings } = useDb();
  const navigate = useNavigate();

  const active = listings.filter((l) => l.status === "active" && l.stock > 0);
  const tabs = useMemo(
    () =>
      categories
        .filter((c) => c.listingCount > 0)
        .map((c) => ({ slug: c.slug, name: c.name, count: c.listingCount })),
    [],
  );

  const [query, setQuery] = useState("");
  const selectedCategory = new URLSearchParams(window.location.search).get("category") ?? tabs[0]?.slug ?? "";

  const items = useMemo(() => {
    if (!selectedCategory) return active;
    return active.filter((l) => l.category === selectedCategory);
  }, [active, selectedCategory]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/marketplace?q=${encodeURIComponent(q)}` : "/marketplace");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Sticky app header — white, rounded chip with grid icon + cart dot */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[430px] items-center justify-between">
          <div className="flex size-9 items-center justify-center rounded-xl border border-gray-100 bg-black text-white shadow-sm" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor">
              <path d={RATING_STARS} />
            </svg>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-100 bg-gray-50 text-gray-700 transition-colors hover:bg-gray-100"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 flex size-2 rounded-full bg-black" />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-100 bg-gray-50 text-gray-700 transition-colors hover:bg-gray-100"
              aria-label="Cart"
            >
              <ShoppingBag className="size-4" />
              <span className="absolute right-1.5 top-1.5 flex size-2 rounded-full bg-black" />
            </button>
          </div>
        </div>
      </header>

      {/* Compact search */}
      <div className="sticky top-[56px] z-20 border-b border-gray-100 bg-white px-4 py-2">
        <div className="mx-auto max-w-[430px]">
          <form onSubmit={submitSearch} role="search">
            <label htmlFor="marketplace-search" className="sr-only">Search social media accounts</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <input
                id="marketplace-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search accounts, niches, platforms…"
                className="h-9 w-full rounded-xl border border-gray-200 bg-gray-50 py-1.5 pl-9 pr-3 text-sm text-black placeholder:text-gray-400 outline-none transition-colors focus:border-[#5b3def] focus:bg-white focus:ring-1 focus:ring-[#5b3def]/20"
              />
            </div>
          </form>
        </div>
      </div>

      {/* Pill category tabs */}
      <div className="sticky top-[100px] z-20 border-b border-gray-100 bg-white px-4">
        <div className="mx-auto flex max-w-[430px] gap-2 overflow-x-auto pb-3 pt-2 scrollbar-none" style={{ scrollbarWidth: "none" }}>
          {tabs.map((tab) => (
            <button
              key={tab.slug}
              type="button"
              onClick={() => {
                const next = selectedCategory === tab.slug ? "" : tab.slug;
                const url = next ? `/marketplace?category=${encodeURIComponent(next)}` : "/marketplace";
                navigate(url, { replace: true });
              }}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                selectedCategory === tab.slug
                  ? "border-[#5b3def] bg-[#5b3def] text-white"
                  : "border-gray-200 bg-white text-black hover:border-gray-300",
              )}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <main className="flex-1 pb-16 px-2 sm:px-4">
        <div className="mx-auto max-w-[430px] pb-4 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {selectedCategory ? `${tabs.find((t) => t.slug === selectedCategory)?.name}` : "All platforms"}
          {" "}— {" "}
          {items.length} {items.length === 1 ? "account" : "accounts"}
        </div>

        {items.length === 0 ? (
          <div className="mx-auto mt-16 max-w-[430px] rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center">
            <p className="text-sm text-gray-600">No accounts in this category yet.</p>
            <button
              type="button"
              onClick={() => navigate("/marketplace", { replace: true })}
              className="mt-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-50"
            >
              View all platforms
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4">
            {items.map((item) => (
              <AccountCard key={item.id} listing={item} />
            ))}
          </div>
        )}
      </main>

      {/* Safe area */}
      <div className="h-2" />

      {/* Sell CTA */}
      <section className="border-t border-gray-100 bg-white py-5 px-4">
        <div className="mx-auto max-w-[430px] rounded-2xl border border-gray-100 bg-gray-50 px-5 py-4">
          <h2 className="mb-1 text-center text-sm font-semibold text-gray-900">Want to sell an account?</h2>
          <p className="mb-3 text-[12px] leading-relaxed text-gray-600">
            Apply in the seller area — admin reviews a few details, then you can create listings that go live in the marketplace.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/seller/apply")}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[12px] font-medium text-black transition-colors hover:bg-gray-100"
            >
              Apply to sell
            </button>
            <button
              type="button"
              onClick={() => navigate("/seller/listings?new=1")}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[12px] font-medium text-black transition-colors hover:bg-gray-100"
            >
              Create a listing
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
