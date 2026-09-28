import { createElement } from "react";
import { Link } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { getCatalogIcon } from "@/components/marketplace/icons";
import type { Category } from "@/data/catalog";

export function CategoryCard({ category }: { category: Category }) {
  const iconComponent = getCatalogIcon(category.icon);

  return (
    <Link
      to={`/marketplace?category=${category.slug}`}
      className="clay clay-hover group flex h-full flex-col p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-(--radius-xl)"
    >
      <span
        className="flex size-11 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105"
        style={{
          background: `linear-gradient(145deg, oklch(0.72 0.12 ${category.hue} / 85%), oklch(0.48 0.15 ${category.hue + 20} / 90%))`,
          boxShadow:
            "inset 0 2px 3px oklch(1 0 0 / 30%), inset 0 -3px 6px oklch(0.2 0.06 260 / 40%), 0 6px 14px -5px oklch(0.55 0.15 260 / 50%)",
        }}
        aria-hidden="true"
      >
        {createElement(iconComponent, {
          className: "size-5 text-white",
          strokeWidth: 1.9,
        })}
      </span>
      <h3 className="mt-4 text-sm font-semibold tracking-tight">
        {category.name}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {category.description}
      </p>
      <p className="mt-3 text-xs font-medium text-primary/90">
        {category.productCount.toLocaleString()} products
      </p>
    </Link>
  );
}

export function CategoryCardSkeleton() {
  return (
    <div className="clay flex h-full flex-col p-5" aria-hidden="true">
      <Skeleton className="size-11 rounded-2xl" />
      <Skeleton className="mt-4 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3 w-full" />
      <Skeleton className="mt-1.5 h-3 w-2/3" />
    </div>
  );
}
