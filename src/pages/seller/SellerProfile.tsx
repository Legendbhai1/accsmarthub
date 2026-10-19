import { useEffect, useState } from "react";
import { SellerLayout } from "@/components/dash/SellerLayout";
import { EmptyState } from "@/components/common/Primitives";
import { readMyStore, friendlyError } from "@/lib/supabaseData";

export default function SellerProfile() {
  const [store, setStore] = useState<Awaited<ReturnType<typeof readMyStore>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await readMyStore();
        if (!cancelled) setStore(row);
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SellerLayout title="Store profile">
      <div className="mx-auto max-w-2xl space-y-6">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading store profile…</p>
        )}

        {error && (
          <div className="surface p-4 text-sm text-destructive">{error}</div>
        )}

        {!loading && !error && store === null && (
          <EmptyState
            title="No store yet"
            description="Create a store profile to start selling."
          />
        )}

        {store && (
          <div className="surface p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">{store.store_name}</p>
                <p className="text-sm text-muted-foreground">/{store.slug}</p>
              </div>
            </div>

            <div className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Store status</span>
                <span className="font-medium">{store.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platforms</span>
                <span className="font-medium">{(store.platforms ?? []).join(", ") || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery speed</span>
                <span className="font-medium">{store.delivery_speed ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Access format</span>
                <span className="font-medium">{store.access_format ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Replacement policy</span>
                <span className="font-medium text-right max-w-[60%] text-left">
                  {store.replacement_policy ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restricted regions</span>
                <span className="font-medium">{store.restricted_regions ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sourcing</span>
                <span className="font-medium text-right max-w-[60%] text-left">
                  {store.sourcing ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact policy</span>
                <span className="font-medium">{store.contact_policy ? "Accepted" : "Not accepted"}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </SellerLayout>
  );
}
