import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "react-router";
import { PackageSearch, RotateCcw, Search, SlidersHorizontal, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ProductCard,
  ProductCardSkeleton,
} from "@/components/marketplace/ProductCard";
import { SiteHeader } from "@/components/marketplace/SiteHeader";
import { SiteFooter } from "@/components/marketplace/SiteFooter";
import { categories, products, sellers } from "@/data/catalog";
import { cn } from "@/lib/utils";

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "popular", label: "Most popular" },
  { value: "rating", label: "Highest rated" },
] as const;

type SortValue = (typeof SORTS)[number]["value"];

const PRICE_RANGES = [
  { value: "all", label: "Any price", min: 0, max: Infinity },
  { value: "under-20", label: "Under $20", min: 0, max: 20 },
  { value: "20-50", label: "$20 – $50", min: 20, max: 50 },
  { value: "50-100", label: "$50 – $100", min: 50, max: 100 },
  { value: "over-100", label: "Over $100", min: 100, max: Infinity },
] as const;

const RATINGS = [
  { value: "all", label: "Any rating", min: 0 },
  { value: "4.5", label: "4.5 & up", min: 4.5 },
  { value: "4", label: "4.0 & up", min: 4.0 },
  { value: "3.5", label: "3.5 & up", min: 3.5 },
] as const;

export default function Marketplace() {
  const [params, setParams] = useSearchParams();

  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "all";
  const sort = (params.get("sort") ?? "newest") as SortValue;
  const priceRange = params.get("price") ?? "all";
  const minRating = params.get("rating") ?? "all";
  const verifiedOnly = params.get("verified") === "1";

  const [searchInput, setSearchInput] = useState(q);
  const [isPending, startTransition] = useTransition();

  // Simulated async fetch: filter changes run inside a transition so the grid
  // stays responsive and skeletons surface while the "fetch" completes.
  useEffect(() => {
    startTransition(() => {});
    const t = window.setTimeout(() => {}, 350);
    return () => window.clearTimeout(t);
  }, [q, category, sort, priceRange, minRating, verifiedOnly, startTransition]);

  const setParam = (key: string, value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === "all") next.delete(key);
        else next.set(key, value);
        return next;
      },
      { preventScrollReset: true },
    );
  };

  const resetFilters = () => {
    setParams(q ? { q } : {}, { preventScrollReset: true });
  };

  const activeFilterCount =
    (category !== "all" ? 1 : 0) +
    (priceRange !== "all" ? 1 : 0) +
    (minRating !== "all" ? 1 : 0) +
    (verifiedOnly ? 1 : 0);

  const sellersById = Object.fromEntries(sellers.map((s) => [s.id, s]));

  const filtered = useMemo(() => {
    const range = PRICE_RANGES.find((r) => r.value === priceRange) ?? PRICE_RANGES[0];
    const ratingMin = RATINGS.find((r) => r.value === minRating)?.min ?? 0;
    const query = q.trim().toLowerCase();

    let list = products.filter((p) => {
      if (query) {
        const sellerName = p.sellerId; // seller lookup done via join below
        const haystack = `${p.name} ${p.description} ${p.category} ${sellerName}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (category !== "all" && p.category !== category) return false;
      if (p.price < range.min || p.price > range.max) return false;
      if (p.rating < ratingMin) return false;
      if (verifiedOnly) {
        const seller = sellersById[p.sellerId];
        if (!seller?.verified) return false;
      }
      return true;
    });

    switch (sort) {
      case "price-asc":
        list = [...list].sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list = [...list].sort((a, b) => b.price - a.price);
        break;
      case "popular":
        list = [...list].sort((a, b) => b.sales - a.sales);
        break;
      case "rating":
        list = [...list].sort((a, b) => b.rating - a.rating);
        break;
      default:
        list = [...list].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }
    return list;
  }, [q, category, sort, priceRange, minRating, verifiedOnly, sellersById]);

  const filterPanel = (
    <div className="space-y-6">
      {/* Category */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Category
        </Label>
        <div className="mt-3 flex flex-wrap gap-2">
          <FilterChip
            active={category === "all"}
            onClick={() => setParam("category", "all")}
          >
            All
          </FilterChip>
          {categories.map((c) => (
            <FilterChip
              key={c.slug}
              active={category === c.slug}
              onClick={() => setParam("category", c.slug)}
            >
              {c.name}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Price */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Price
        </Label>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRICE_RANGES.map((r) => (
            <FilterChip
              key={r.value}
              active={priceRange === r.value}
              onClick={() => setParam("price", r.value)}
            >
              {r.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Rating */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rating
        </Label>
        <div className="mt-3 flex flex-wrap gap-2">
          {RATINGS.map((r) => (
            <FilterChip
              key={r.value}
              active={minRating === r.value}
              onClick={() => setParam("rating", r.value)}
            >
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {r.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Verification */}
      <div className="flex items-center justify-between rounded-2xl px-1">
        <Label htmlFor="verified-filter" className="text-sm font-medium">
          Verified sellers only
        </Label>
        <Switch
          id="verified-filter"
          checked={verifiedOnly}
          onCheckedChange={(checked) => setParam("verified", checked ? "1" : "")}
        />
      </div>

      {activeFilterCount > 0 && (
        <Button
          variant="outline"
          className="w-full rounded-xl"
          onClick={resetFilters}
        >
          <RotateCcw className="size-4" /> Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
          {/* Page head */}
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Marketplace</h1>
              <p className="mt-2 text-muted-foreground">
                {filtered.length} product{filtered.length === 1 ? "" : "s"}
                {q ? ` matching “${q}”` : " from verified sellers"}
              </p>
            </div>

            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                setParam("q", searchInput.trim());
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search software, games, assets, courses…"
                  aria-label="Search products"
                  className="clay-inset h-11 rounded-2xl border-border/60 pl-10"
                />
              </div>
              <Button type="submit" variant="clay" className="rounded-2xl">
                Search
              </Button>

              {/* Mobile filter trigger */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    className="rounded-2xl lg:hidden"
                    aria-label="Open filters"
                  >
                    <SlidersHorizontal className="size-4" />
                    {activeFilterCount > 0 && (
                      <Badge className="size-5 justify-center rounded-full p-0 text-[10px]">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-80 gap-0 overflow-y-auto border-border/70"
                >
                  <SheetHeader className="px-5 pb-2 pt-5">
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  <div className="px-5 pb-8">{filterPanel}</div>
                </SheetContent>
              </Sheet>
            </form>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
            {/* Sidebar (desktop) */}
            <aside className="hidden lg:block">
              <div className="clay sticky top-24 p-6">{filterPanel}</div>
            </aside>

            {/* Results */}
            <section aria-label="Products" className="min-w-0">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Sort by
                </p>
                <Select value={sort} onValueChange={(v) => setParam("sort", v)}>
                  <SelectTrigger
                    size="sm"
                    aria-label="Sort products"
                    className="clay-inset w-48 rounded-xl border-border/60"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isPending ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="clay flex flex-col items-center justify-center px-6 py-20 text-center">
                  <div className="clay-inset flex size-16 items-center justify-center rounded-3xl">
                    <PackageSearch className="size-7 text-muted-foreground" />
                  </div>
                  <h2 className="mt-5 text-lg font-semibold">
                    No products found
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    Try a different search term or loosen a filter — new products
                    are added every day.
                  </p>
                  <Button
                    variant="clay"
                    className="mt-6 rounded-xl"
                    onClick={() => {
                      setSearchInput("");
                      resetFilters();
                    }}
                  >
                    <RotateCcw className="size-4" /> Reset search & filters
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((product) => (
                    <ProductCard key={product.slug} product={product} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        active
          ? "clay-btn bg-primary text-primary-foreground"
          : "clay-inset text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
