import { Link } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandIcon } from "@/components/marketplace/BrandIcon";
import type { Category } from "@/data/catalog";

export function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      to={`/marketplace?category=${category.slug}`}
      className="group flex h-full flex-col rounded-2xl border border-border/70 bg-card/40 p-5 outline-none transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <BrandIcon
        brand={category.brand}
        colored
        className="size-6 transition-transform duration-200 group-hover:scale-110"
      />
      <h3 className="mt-4 text-sm font-semibold tracking-tight">
        {category.name}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {category.description}
      </p>
      <p className="mt-3 text-xs font-medium text-primary/90">
        {category.productCount.toLocaleString()} listings
      </p>
    </Link>
  );
}

export function CategoryCardSkeleton() {
  return (
    <div className="flex h-full flex-col p-5" aria-hidden="true">
      <Skeleton className="size-6" />
      <Skeleton className="mt-4 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3 w-full" />
      <Skeleton className="mt-1.5 h-3 w-2/3" />
    </div>
  );
}
