import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { toast } from "sonner";

export default function AdminSettings() {
  const [feePercent, setFeePercent] = useState("8");
  const [escrowWindow, setEscrowWindow] = useState("30");
  const [autoApprove, setAutoApprove] = useState(false);
  const [maintenance, setMaintenance] = useState(false);

  return (
    <DashLayout title="Site settings" nav={adminNav}>
      <form
        className="max-w-2xl space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          toast.success("Settings saved (demo)");
        }}
      >
        <div className="glass space-y-4 p-6">
          <h3 className="font-semibold">Marketplace</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="setting-fee">Seller fee (%)</Label>
              <Input
                id="setting-fee"
                type="number"
                min={0}
                max={50}
                value={feePercent}
                onChange={(e) => setFeePercent(e.target.value)}
                className="inset-well rounded-xl border-border/60"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="setting-window">Dispute window (days)</Label>
              <Input
                id="setting-window"
                type="number"
                min={1}
                max={90}
                value={escrowWindow}
                onChange={(e) => setEscrowWindow(e.target.value)}
                className="inset-well rounded-xl border-border/60"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium">Auto-approve verified sellers</p>
              <p className="text-xs text-muted-foreground">
                Skip manual moderation for sellers with a clean record.
              </p>
            </div>
            <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium">Maintenance mode</p>
              <p className="text-xs text-muted-foreground">
                Temporarily take the marketplace offline for buyers.
              </p>
            </div>
            <Switch checked={maintenance} onCheckedChange={setMaintenance} />
          </div>
        </div>

        <Button type="submit" className="rounded-xl">
          Save settings
        </Button>
      </form>
    </DashLayout>
  );
}
