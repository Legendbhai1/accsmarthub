import { useMemo } from "react";
import { Link } from "react-router";
import { BadgeCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SellerLayout } from "@/components/dash/SellerLayout";
import { StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useMyStore, useEarningsSummary } from "@/lib/supabaseQueries";
import { publicAssetUrl } from "@/lib/supabaseMutations";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

/**
 * Seller profile.
 *
 * Shows the seller's real store record and their real order stats. There is
 * no seeded "4.9 rating / 3,120 sales" here — those were invented, so they
 * are gone rather than restated.
 */
export default function SellerProfile() {
  const { user } = useSession();
  const storeQuery = useMyStore();
  const summaryQuery = useEarningsSummary();
  const store = storeQuery.data;
  const summary = summaryQuery.data;

  // The buyer-facing answers are stored as columns on the store row, so render
  // whichever ones the seller has actually filled in.
  const answers = useMemo(
    () =>
      [
        ["Delivery speed", store?.delivery_speed],
        ["Access format", store?.access_format],
        ["Replacement policy", store?.replacement_policy],
        ["Restricted regions", store?.restricted_regions],
        ["Sourcing", store?.sourcing],
      ]
        .filter((pair): pair is [string, string] => !!pair[1])
        .map(([question, answer]) => ({ question, answer })),
    [
      store?.delivery_speed,
      store?.access_format,
      store?.replacement_policy,
      store?.restricted_regions,
      store?.sourcing,
    ],
  );

  if (storeQuery.loading) {
    return (
      <SellerLayout title="Profile">
        <p className="text-sm text-muted-foreground">Loading your profile…</p>
      </SellerLayout>
    );
  }

  if (!store) {
    return (
      <SellerLayout title="Profile">
        <div className="glass mx-auto max-w-lg p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Lock className="size-5 text-muted-foreground" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">No store profile yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Set up your store to start selling. It takes a couple of minutes
            and an admin reviews it before your listings go live.
          </p>
          <Button className="mt-5 rounded-xl" asChild>
            <Link to="/seller/apply">Set up my store</Link>
          </Button>
        </div>
      </SellerLayout>
    );
  }

  return (
    <SellerLayout title="Profile">
      <div className="max-w-2xl space-y-6">
        <div className="glass p-6">
          <div className="flex flex-wrap items-center gap-4">
            {store.logo_path ? (
              <img
                src={publicAssetUrl("store-assets", store.logo_path)}
                alt=""
                className="size-14 rounded-2xl object-cover"
              />
            ) : (
              <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">
                {store.store_name.charAt(0)}
              </span>
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-semibold">
                {store.store_name}
                {store.status === "approved" && (
                  <BadgeCheck
                    className="size-4.5 text-emerald-600"
                    aria-label="Verified store"
                  />
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {user?.email} · member since{" "}
                {new Date(store.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <span className="ml-auto">
              <StatusBadge status={store.status} />
            </span>
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="inset-well rounded-xl px-4 py-3">
              <dt className="text-xs text-muted-foreground">Completed sales</dt>
              <dd className="text-lg font-bold tabular-nums">
                {summary?.completedCount ?? 0}
              </dd>
            </div>
            <div className="inset-well rounded-xl px-4 py-3">
              <dt className="text-xs text-muted-foreground">Lifetime gross</dt>
              <dd className="text-lg font-bold tabular-nums">
                {summary ? formatPrice(summary.grossUsd) : "—"}
              </dd>
            </div>
            <div className="inset-well rounded-xl px-4 py-3">
              <dt className="text-xs text-muted-foreground">Net earned</dt>
              <dd className="text-lg font-bold tabular-nums text-emerald-600">
                {summary ? formatPrice(summary.netUsd) : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="glass p-6">
          <h3 className="font-semibold">What buyers see</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            These answers appear on every listing you publish. Edit them in{" "}
            <Link to="/seller/settings" className="underline underline-offset-4">
              store settings
            </Link>
            .
          </p>
          <dl className="mt-4 divide-y divide-border/60">
            {answers.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                You have not filled in your buyer-facing answers yet.
              </p>
            ) : (
              answers.map((a) => (
              <div key={a.question} className="flex flex-wrap gap-2 py-3">
                  <dt className="w-full text-xs text-muted-foreground sm:w-44">
                    {a.question}
                  </dt>
                  <dd className="min-w-0 flex-1 text-sm">{a.answer}</dd>
                </div>
              ))
            )}
          </dl>
        </div>

        <form
          className="glass space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            toast.info("Public profile editing is not connected yet", {
              description:
                "Your store name and buyer-facing answers are editable in Store settings.",
            });
          }}
        >
          <h3 className="font-semibold">Public profile</h3>
          <div className="grid gap-2">
            <Label htmlFor="seller-name">Display name</Label>
            <Input
              id="seller-name"
              defaultValue={store.store_name}
              className="inset-well rounded-xl border-border/60"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="seller-bio">Bio</Label>
            <Textarea
              id="seller-bio"
              className="inset-well min-h-24 rounded-xl border-border/60"
              defaultValue="Full-service account brokerage. Every listing ships with verified ownership documents and a guided handover."
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="seller-contact">Contact email</Label>
            <Input
              id="seller-contact"
              type="email"
              readOnly
              value={user?.email ?? ""}
              className="inset-well rounded-xl border-border/60"
            />
            <p className="text-xs text-muted-foreground">
              Sign-in email is fixed. Contact through AccsMartHub support only.
            </p>
          </div>
          <Button type="submit" className="rounded-xl">
            Save changes
          </Button>
        </form>
      </div>
    </SellerLayout>
  );
}
