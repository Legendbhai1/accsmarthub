import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { BrandMark } from "@/components/site/BrandMark";
import { categories } from "@/lib/db";
import { toast } from "sonner";

export default function AdminCategories() {
  return (
    <DashLayout title="Categories" nav={adminNav}>
      <div className="max-w-2xl space-y-5">
        <div className="glass overflow-hidden">
          <ul className="divide-y divide-border/60">
            {categories.map((c) => (
              <li key={c.slug} className="flex items-center gap-4 px-5 py-4">
                <span className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
                  <BrandMark brand={c.brand} colored className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {c.listingCount.toLocaleString()} listings
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => toast.info("Demo mode", { description: "Category editing persists server-side in production." })}
                >
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <form
          className="glass flex flex-col gap-3 p-5 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            toast.info("Demo mode", { description: "New categories are created server-side in production." });
          }}
        >
          <Input
            placeholder="New category name"
            aria-label="New category name"
            className="inset-well rounded-xl border-border/60"
          />
          <Button type="submit" className="rounded-xl">
            Add category
          </Button>
        </form>
      </div>
    </DashLayout>
  );
}
