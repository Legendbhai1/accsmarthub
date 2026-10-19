import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { useSavedListings } from "@/lib/supabaseQueries";
import { toggleSavedListing } from "@/lib/supabaseMutations";
import { toast } from "sonner";

/** Accounts the buyer hearted on the marketplace. */
export default function BuyerSaved() {
  const savedQuery = useSavedListings();
  const saved = savedQuery.data ?? [];

  const unsave = async (id: string) => {
    try {
      await toggleSavedListing(id, false);
      savedQuery.refresh();
    } catch (err) {
      toast.error("Could not remove it", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <DashLayout title="Saved accounts" nav={buyerNav}>
      {savedQuery.loading ? (
        <EmptyState title="Loading saved accounts…" description="Fetching your list." />
      ) : savedQuery.error ? (
        <EmptyState
          title="Could not load your saved accounts"
          description={savedQuery.error}
          action={
            <Button variant="outline" className="rounded-xl" onClick={savedQuery.refresh}>
              Try again
            </Button>
          }
        />
      ) : saved.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Tap the heart on any listing to keep it here for later."
          action={
            <Button variant="outline" className="rounded-xl" asChild>
              <Link to="/marketplace">Browse marketplace</Link>
            </Button>
          }
        />
      ) : (
        <div className="glass overflow-hidden">
          <ul className="divide-y divide-border/60">
            {saved.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                <Link
                  to={`/marketplace/${item.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
                    <BrandMark brand={item.brand} colored className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.serviceCategory ?? item.brand} ·{" "}
                      {item.stock > 0 ? `${item.stock} in stock` : "Sold out"}
                    </span>
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums">
                    {formatPrice(item.priceUsd)}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-muted-foreground"
                  onClick={() => unsave(item.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashLayout>
  );
}
