import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { PackageSearch, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
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
import { ListingCard } from "@/components/common/ListingCard";
import { Pagination } from "@/components/common/Pagination";
import { BrandMark } from "@/components/site/BrandMark";
import { categories, getSeller, useDb } from "@/lib/db";
import { cn } from "@/lib/utils";

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "popular", label: "Popularity" },
  { value: "rating", label: "Highest rated" },
] as const;

type SortValue = (typeof SORTS)[number]["value"];

const PRICE_RANGES = [
  { value: "all", label: "Any price", min: 0, max: Infinity },
  { value: "under-3k", label: "Under $3,000", min: 0, max: 2999 },
  { value: "3k-6k", label: "$3,000 – $6,000", min: 3000, max: 6000 },
  { value: "6k-9k", label: "$6,000 – $9,000", min: 6000, max: 9000 },
  { value: "over-9k", label: "Over $9,000", min: 9000, max: Infinity },
] as const;

const PAGE_SIZE = 9;

export default function Marketplace() {
  const { listings } = useDb();
  const [params, setParams] = useSearchParams();

  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "all";
  const sort = (params.get("sort") ?? "newest") as SortValue;
  const priceRange = params.get("price") ?? "all";
  const availability = params.get("availability") ?? "all";
  const verifiedOnly = params.get("verified") === "1";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const [searchInput, setSearchInput] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setParam = (key: string, value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === "all") next.delete(key);
        else next.set(key, value);
        if (key !== "page") next.delete("page");
        return next;
      },
      { preventScrollReset: true },
    );
  };

  const resetFilters = () => {
    setParams(q ? { q } : {}, { preventScrollReset: true });
  };

  const filtered = useMemo(() => {
    const range = PRICE_RANGES.find((r) => r.value === priceRange) ?? PRICE_RANGES[0];
    const query = q.trim().toLowerCase();

    let list = listings.filter((l) => {
      if (l.status === "sold") return false;
      if (query) {
        const haystack =
          `${l.title} ${l.niche} ${l.description} ${l.brand}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (category !== "all" && l.category !== category) return false;
      if (l.price < range.min || l.price > range.max) return false;
      if (availability === "available" && l.status !== "active") return false;
      if (verifiedOnly && !getSeller(l.sellerId).verified) return false;
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
        list = [...list].sort((a, b) => b.followers - a.followers);
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
  }, [listings, q, category, sort, priceRange, availability, verifiedOnly]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const activeFilterCount =
    (category !== "all" ? 1 : 0) +
    (priceRange !== "all" ? 1 : 0) +
    (availability !== "all" ? 1 : 0) +
    (verifiedOnly ? 1 : 0);

  const filterPanel = (
    <div className="space-y-6">
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Platform
        </Label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <FilterChip active={category === "all"} onClick={() => setParam("category", "all")}>
            All
          </FilterChip>
          {categories.map((c) => (
            <FilterChip
              key={c.slug}
              active={category === c.slug}
              onClick={() => setParam("category", c.slug)}
            >
              <BrandMark brand={c.brand} className="size-3.5" />
              {c.name}
            </FilterChip>
          ))}
        </div>
      </div>

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

      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Availability
        </Label>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { value: "all", label: "All" },
            { value: "available", label: "Available now" },
          ].map((a) => (
            <FilterChip
              key={a.value}
              active={availability === a.value}
              onClick={() => setParam("availability", a.value)}
            >
              {a.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
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
        <Button variant="outline" className="w-full rounded-xl" onClick={resetFilters}>
          <RotateCcw className="size-4" /> Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketplace</h1>
          <p className="mt-2 text-muted-foreground">
            {filtered.length} listing{filtered.length === 1 ? "" : "s"}
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
              placeholder="Search platforms, niches, audience sizes…"
              aria-label="Search listings"
              className="inset-well h-11 rounded-xl border-border/60 pl-10"
            />
          </div>
          <Button type="submit" className="rounded-xl">
            Search
          </Button>

          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl xl:hidden"
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
            <SheetContent side="left" className="w-80 gap-0 overflow-y-auto border-border/70">
              <SheetHeader className="px-5 pb-2 pt-5">
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="px-5 pb-8">{filterPanel}</div>
            </SheetContent>
          </Sheet>
        </form>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="hidden lg:block">
          <div className="glass sticky top-24 p-6">{filterPanel}</div>
        </aside>

        <section aria-label="Listings" className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Sort by</p>
            <Select value={sort} onValueChange={(v) => setParam("sort", v)}>
              <SelectTrigger
                size="sm"
                aria-label="Sort listings"
                className="inset-well w-44 rounded-xl border-border/60"
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

          {pageItems.length === 0 ? (
            <div className="glass flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/60">
                <PackageSearch className="size-6 text-muted-foreground" />
              </div>
              <h2 className="mt-5 text-lg font-semibold">No listings found</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Try a different search term or loosen a filter — new accounts
                are listed every day.
              </p>
              <Button
                variant="outline"
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
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pageItems.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
              <div className="mt-8">
                <Pagination
                  page={currentPage}
                  pageCount={pageCount}
                  onChange={(p) => setParam("page", String(p))}
                />
              </div>
            </>
          )}
        </section>
      </div>
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
        "inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        active
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-border/70 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
