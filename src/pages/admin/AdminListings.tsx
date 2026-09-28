import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { ConfirmDialog, StatusBadge } from "@/components/common/Primitives";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { api, getSeller, useDb, type Listing } from "@/lib/db";
import { toast } from "sonner";

export default function AdminListings() {
  const { listings } = useDb();
  const [suspendTarget, setSuspendTarget] = useState<Listing | null>(null);

  const act = (l: Listing) => {
    if (l.status === "pending") {
      api.updateListing(l.id, { status: "active" });
      toast.success("Listing approved and live");
    } else if (l.status === "active") {
      setSuspendTarget(l);
    } else {
      api.updateListing(l.id, { status: "active" });
      toast.success("Listing reinstated");
    }
  };

  return (
    <DashLayout title="Listing management" nav={adminNav}>
      <div className="glass overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-6 py-3.5">Listing</th>
              <th className="px-6 py-3.5">Seller</th>
              <th className="px-6 py-3.5">Price</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {listings.map((l) => (
              <tr key={l.id} className="transition-colors hover:bg-accent/30">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-muted/40">
                      <BrandMark brand={l.brand} colored className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="max-w-56 truncate font-medium">{l.title}</p>
                      <p className="text-xs text-muted-foreground">{l.niche}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">{getSeller(l.sellerId).name}</td>
                <td className="px-6 py-4 tabular-nums">{formatPrice(l.price)}</td>
                <td className="px-6 py-4"><StatusBadge status={l.status} /></td>
                <td className="px-6 py-4 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => act(l)}
                    disabled={l.status === "sold"}
                  >
                    {l.status === "pending"
                      ? "Approve"
                      : l.status === "active"
                        ? "Suspend"
                        : "Reinstate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={() => setSuspendTarget(null)}
        title={`Suspend “${suspendTarget?.title ?? ""}”?`}
        description="The listing is hidden from the marketplace pending review."
        confirmLabel="Suspend listing"
        destructive
        onConfirm={() => {
          if (suspendTarget) {
            api.updateListing(suspendTarget.id, { status: "paused" });
            toast("Listing suspended");
          }
        }}
      />
    </DashLayout>
  );
}
