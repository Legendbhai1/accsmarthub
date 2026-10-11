import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import {
  ConfirmDialog,
  EmptyState,
  StatusBadge,
} from "@/components/common/Primitives";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { useAdminListings, type AdminListingRow } from "@/lib/supabaseQueries";
import { setListingStatus } from "@/lib/supabaseMutations";
import { toast } from "sonner";

type Filter = "pending" | "active" | "paused" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Awaiting review" },
  { key: "active", label: "Live" },
  { key: "paused", label: "Paused" },
  { key: "all", label: "All" },
];

/**
 * Listing moderation.
 *
 * Every row here is a real `listings` row read over RLS (`read listings`
 * exposes all statuses to an admin). The one action that matters is
 * `pending -> active`: a seller can create a listing at any time, but only
 * this call makes it visible in the marketplace, and the database records the
 * decision in `admin_audit` via `set_listing_status()`.
 *
 * A non-admin who somehow reached this page would not be refused — the RPC
 * falls back to hiding their own listing — so the route is also guarded in
 * `main.tsx`.
 */
export default function AdminListings() {
  const listingsQuery = useAdminListings();
  const listings = listingsQuery.data ?? [];
  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<AdminListingRow | null>(null);

  const shown =
    filter === "all" ? listings : listings.filter((l) => l.status === filter);

  const countFor = (key: Filter) =>
    key === "all" ? listings.length : listings.filter((l) => l.status === key).length;

  const setStatus = async (
    listing: AdminListingRow,
    status: "active" | "paused",
    success: string,
  ) => {
    setBusyId(listing.id);
    try {
      await setListingStatus({ listingId: listing.id, status });
      listingsQuery.refresh();
      toast.success(success);
    } catch (err) {
      toast.error("Could not update the listing", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const act = (listing: AdminListingRow) => {
    if (listing.status === "active") {
      setSuspendTarget(listing);
      return;
    }
    void setStatus(
      listing,
      "active",
      listing.status === "pending" ? "Listing approved and live" : "Listing reinstated",
    );
  };

  return (
    <DashLayout title="Listing management" nav={adminNav}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-muted-foreground">
            Sellers can create a listing at any time. It stays invisible until
            it is approved here — this is the step that publishes it.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(({ key, label }) => (
              <Button
                key={key}
                variant={filter === key ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setFilter(key)}
              >
                {label}
                <span className="ml-1.5 text-xs opacity-70">{countFor(key)}</span>
              </Button>
            ))}
          </div>
        </div>

        {listingsQuery.loading ? (
          <p className="text-sm text-muted-foreground">Loading listings…</p>
        ) : shown.length === 0 ? (
          <EmptyState
            title={filter === "pending" ? "Nothing awaiting review" : "No listings here"}
            description={
              filter === "pending"
                ? "New seller listings land in this queue and stay hidden from the marketplace until you approve them."
                : "Try another filter — or wait for a seller to publish something."
            }
          />
        ) : (
          <div className="glass overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3.5">Listing</th>
                  <th className="px-6 py-3.5">Seller</th>
                  <th className="px-6 py-3.5">Price</th>
                  <th className="px-6 py-3.5">Stock</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {shown.map((l) => {
                  const busy = busyId === l.id;
                  return (
                    <tr key={l.id} className="transition-colors hover:bg-accent/30">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-muted/40">
                            <BrandMark brand={l.brand} colored className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-56 truncate font-medium">
                              {l.title}
                              {l.hidden && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  (hidden by seller)
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {l.service_category ?? l.brand}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="block truncate">{l.seller_name}</span>
                        {l.seller_email && (
                          <span className="block max-w-48 truncate text-xs text-muted-foreground">
                            {l.seller_email}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 tabular-nums">
                        {formatPrice(l.price_usd)}
                      </td>
                      <td className="px-6 py-4 tabular-nums">{l.stock}</td>
                      <td className="px-6 py-4">
                        <StatusBadge
                          status={l.status === "pending" ? "under_review" : l.status}
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => act(l)}
                          disabled={busy || l.status === "sold"}
                        >
                          {l.status === "pending"
                            ? "Approve"
                            : l.status === "active"
                              ? "Suspend"
                              : "Reinstate"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={() => setSuspendTarget(null)}
        title={`Suspend “${suspendTarget?.title ?? ""}”?`}
        description="The listing is hidden from the marketplace until you reinstate it."
        confirmLabel="Suspend listing"
        destructive
        onConfirm={() => {
          const target = suspendTarget;
          setSuspendTarget(null);
          if (target) void setStatus(target, "paused", "Listing suspended");
        }}
      />
    </DashLayout>
  );
}
