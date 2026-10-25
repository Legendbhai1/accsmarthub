import { Percent, Wallet } from "lucide-react";
import { WithdrawalPanel } from "@/components/dash/WithdrawalPanel";
import { EmptyState, StatCard, StatusBadge } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useEarningsSummary, useMyPayouts } from "@/lib/supabaseQueries";
import { SELLER_WITHDRAWAL } from "@/lib/withdrawalTiers";

/** Earnings — payouts and available balance for the seller. */
export default function SellerEarnings() {
  const { user, refresh } = useSession();
  const summaryQuery = useEarningsSummary();
  const payoutsQuery = useMyPayouts();
  const loading = summaryQuery.loading;

  const completed = summaryQuery.data?.grossUsd ?? 0;
  const commission = summaryQuery.data?.commissionUsd ?? 0;
  const escrow = summaryQuery.data?.escrowUsd ?? 0;

  // A seller withdraws their EARNINGS, not their total balance. A deposit is
  // not sale proceeds and is not withdrawable here (migration 0019) — so the
  // figure below reads `earnedBalance`, and the server enforces the same pool.
  const earned = user?.earnedBalance ?? 0;
  const pendingPayouts = (payoutsQuery.data ?? [])
    .filter((p) => p.status === "requested" || p.status === "approved")
    .reduce((s, p) => s + p.amountUsd, 0);
  const withdrawable = Math.max(0, earned - pendingPayouts);

  return (
    <>
      <div className="seller-page space-y-6">
        <div className="seller-page-head">
          <p className="seller-sub text-sm text-muted-foreground">
            What you have earned, what escrow still holds, and what you can withdraw.
          </p>
        </div>

        <div className="seller-stat-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Gross sales"
            value={loading ? "—" : formatPrice(completed)}
            icon={Wallet}
            hint="Before platform commission"
          />
          <StatCard
            label="Platform commission (10%)"
            value={loading ? "—" : `−${formatPrice(commission)}`}
            icon={Percent}
            hint="Deducted from every completed sale"
          />
          <StatCard
            label="Available to withdraw"
            value={loading ? "—" : formatPrice(withdrawable)}
            icon={Wallet}
            hint={
              pendingPayouts > 0
                ? `${formatPrice(pendingPayouts)} held for review`
                : `Sale proceeds, ${formatPrice(SELLER_WITHDRAWAL.minimum)} minimum`
            }
          />
          <StatCard
            label="In escrow"
            value={loading ? "—" : formatPrice(escrow)}
            hint="Releases after transfer"
            icon={Wallet}
          />
        </div>

        <div className="card">
          <h3 className="font-semibold">How your payout is calculated</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div className="inset-well rounded-xl px-4 py-3">
              <dt className="text-xs text-muted-foreground">Item price</dt>
              <dd className="text-lg font-bold tabular-nums">{formatPrice(completed)}</dd>
            </div>
            <div className="inset-well rounded-xl px-4 py-3">
              <dt className="text-xs text-muted-foreground">AccsMartHub fee (10%)</dt>
              <dd className="text-lg font-bold tabular-nums text-destructive">
                −{formatPrice(commission)}
              </dd>
            </div>
            <div className="inset-well rounded-xl px-4 py-3">
              <dt className="text-xs text-muted-foreground">You receive</dt>
              <dd className="text-lg font-bold tabular-nums text-success">
                {formatPrice(Math.max(0, completed - commission))}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            The 10% commission is calculated on the server for every order and
            recorded on the order itself, so your statements always reconcile.
          </p>
        </div>

        {/* Sale proceeds are withdrawn on the seller tier: $10 minimum, 1%
            fee, from the earnings pool. A deposit sitting in the same wallet
            is not visible here and cannot be withdrawn through this form. */}
        <WithdrawalPanel
          tier={SELLER_WITHDRAWAL}
          available={withdrawable}
          title="Withdraw sale proceeds"
          description="Request a withdrawal of your earnings and our team settles it. The amount is held from the moment you request it."
          onDone={async () => {
            await Promise.all([payoutsQuery.refresh(), summaryQuery.refresh(), refresh()]);
          }}
        />

        <div className="card overflow-hidden">
          <div className="seller-table-head hidden grid-cols-[1fr_8rem_9rem] gap-4 border-b border-border/70 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Withdrawal</span>
            <span>Amount</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="divide-y divide-border/60">
            {payoutsQuery.loading ? (
              <li className="px-5 py-6 text-sm text-muted-foreground">Loading your withdrawals…</li>
            ) : (payoutsQuery.data ?? []).length === 0 ? (
              <li className="px-5 py-6">
                <EmptyState
                  title="No withdrawals yet"
                  description="Request a withdrawal above and it will appear here while it is reviewed."
                />
              </li>
            ) : (
              (payoutsQuery.data ?? []).map((p) => (
                <li
                  key={p.id}
                  className="seller-order-row flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6"
                >
                  <span className="seller-order-cell min-w-0 flex-1">
                    <span className="seller-order-title block text-sm font-medium">
                      {p.method} · {p.destination}
                    </span>
                    <span className="seller-order-meta text-xs text-muted-foreground">
                      Requested {new Date(p.requestedAt).toLocaleDateString()}
                      {p.feeUsd > 0
                        ? ` — fee ${formatPrice(p.feeUsd)}, you receive ${formatPrice(p.netUsd)}`
                        : ""}
                      {p.reviewNote ? ` — ${p.reviewNote}` : ""}
                    </span>
                  </span>
                  <span className="w-20 text-sm font-semibold tabular-nums">
                    {formatPrice(p.amountUsd)}
                  </span>
                  <span className="ml-auto">
                    <StatusBadge status={p.status} />
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </>
  );
}
