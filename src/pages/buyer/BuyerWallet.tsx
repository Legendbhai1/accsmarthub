import { ArrowDownToLine, CreditCard, Landmark, Plus, Wallet } from "lucide-react";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { StatCard } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { useDb } from "@/lib/db";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export default function BuyerWallet() {
  const { user } = useSession();
  const { orders } = useDb();
  const mine = orders.filter((o) => o.buyerId === "u-me");

  return (
    <DashLayout title="Wallet" nav={buyerNav}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Available balance" value={formatPrice(user?.balance ?? 0)} icon={Wallet} hint="Usable at checkout" />
          <StatCard
            label="Held in escrow"
            value={formatPrice(
              mine
                .filter((o) => o.status === "in_escrow" || o.status === "transferring")
                .reduce((s, o) => s + o.total, 0),
            )}
            icon={ArrowDownToLine}
            hint="Released on your confirmation"
          />
        </div>

        <div className="glass p-6">
          <h3 className="font-semibold">Top up</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Card", icon: CreditCard },
              { label: "Bank transfer", icon: Landmark },
              { label: "Crypto", icon: Plus },
            ].map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => toast.info("Demo mode", { description: "Payment providers connect here in production." })}
                className="inset-well flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm transition-colors hover:bg-accent/40"
              >
                <Icon className="size-4 text-primary" />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Top-ups are disabled in the demo. Payment provider integration
            happens server-side in production.
          </p>
        </div>

        <div className="glass p-6">
          <h3 className="font-semibold">Transaction history</h3>
          <ul className="mt-4 divide-y divide-border/60 text-sm">
            {mine.slice(0, 6).map((order) => (
              <li key={order.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{order.listingTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    #{order.id} · {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">−{formatPrice(order.total)}</p>
                  <p className="text-xs capitalize text-muted-foreground">{order.status.replace(/_/g, " ")}</p>
                </div>
              </li>
            ))}
            {mine.length === 0 && (
              <li className="py-6 text-center text-muted-foreground">No transactions yet.</li>
            )}
          </ul>
        </div>
      </div>
    </DashLayout>
  );
}
