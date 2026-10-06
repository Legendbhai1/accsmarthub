import { useState } from "react";
import { Download, Globe, Shield, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { toast } from "sonner";

export default function AdminSettings() {
  const [feePercent, setFeePercent] = useState(10);
  const [escrowDays, setEscrowDays] = useState(7);
  const [maxPurchaseLimit, setMaxPurchaseLimit] = useState(5000);
  const [autoApprove, setAutoApprove] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [requireEmailVerify, setRequireEmailVerify] = useState(true);
  const [blockDisposable, setBlockDisposable] = useState(true);
  const [minimumPasswordLength, setMinimumPasswordLength] = useState(8);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Settings updated", {
      description: "Changes apply immediately to new signups and orders.",
    });
  };

  return (
    <DashLayout title="Site settings" nav={adminNav}>
      <form onSubmit={handleSave} className="space-y-6">
        {/* Marketplace settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="size-5" />
              Marketplace
            </CardTitle>
            <CardDescription>Fees, limits and platform behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fee">Seller fee (%)</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[feePercent]}
                    onValueChange={(v) => setFeePercent(v[0])}
                    min={0}
                    max={25}
                    step={1}
                    className="cursor-pointer"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={25}
                    value={feePercent}
                    onChange={(e) => setFeePercent(Number(e.target.value))}
                    className="w-20 inset-well rounded-lg border-border/60 tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Taken from every completed sale as platform commission.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="escrow">Escrow window (days)</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[escrowDays]}
                    onValueChange={(v) => setEscrowDays(v[0])}
                    min={1}
                    max={30}
                    step={1}
                    className="cursor-pointer"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={escrowDays}
                    onChange={(e) => setEscrowDays(Number(e.target.value))}
                    className="w-20 inset-well rounded-lg border-border/60 tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  How long a buyer has to confirm receipt before funds auto-release.
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="limit">Max purchase per order ($)</Label>
                <Input
                  id="limit"
                  type="number"
                  min={100}
                  max={50000}
                  step={100}
                  value={maxPurchaseLimit}
                  onChange={(e) => setMaxPurchaseLimit(Number(e.target.value))}
                  className="inset-well rounded-xl border-border/60"
                />
                <p className="text-xs text-muted-foreground">
                  Hard cap on a single order to limit exposure.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Risk limits</Label>
                <div className="inset-well rounded-xl border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">New seller limit</span>
                    <span className="text-sm font-medium tabular-nums">$1,000</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Unverified account limit</span>
                    <span className="text-sm font-medium tabular-nums">$500</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Daily purchase cap</span>
                    <span className="text-sm font-medium tabular-nums">$10,000</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="size-5" />
              Security & verification
            </CardTitle>
            <CardDescription>Account creation and authentication policies.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">Require email verification</p>
                <p className="text-xs text-muted-foreground">
                  New accounts must confirm their email before browsing.
                </p>
              </div>
              <Switch checked={requireEmailVerify} onCheckedChange={setRequireEmailVerify} />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">Block disposable email domains</p>
                <p className="text-xs text-muted-foreground">
                  Reject temporary mailboxes at signup (client + server).
                </p>
              </div>
              <Switch checked={blockDisposable} onCheckedChange={setBlockDisposable} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pwd-length">Minimum password length</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[minimumPasswordLength]}
                  onValueChange={(v) => setMinimumPasswordLength(v[0])}
                  min={6}
                  max={20}
                  step={1}
                  className="cursor-pointer"
                />
                <Input
                  type="number"
                  min={6}
                  max={20}
                  value={minimumPasswordLength}
                  onChange={(e) => setMinimumPasswordLength(Number(e.target.value))}
                  className="w-20 inset-well rounded-lg border-border/60 tabular-nums"
                />
                <span className="text-sm text-muted-foreground">chars</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Applied to password sign-up and password reset.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Seller onboarding */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="size-5" />
              Seller onboarding
            </CardTitle>
            <CardDescription>How new sellers enter the marketplace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">Auto-approve trusted sellers</p>
                <p className="text-xs text-muted-foreground">
                  Skip manual review for sellers with prior approved stores.
                </p>
              </div>
              <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="review-hours">Review SLA (hours)</Label>
                <Input
                  id="review-hours"
                  type="number"
                  min={1}
                  max={168}
                  value={24}
                  className="inset-well rounded-xl border-border/60"
                />
                <p className="text-xs text-muted-foreground">
                  Target time to review a store application.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="required-fields">Required store fields</Label>
                <div className="inset-well rounded-xl border-border/60 space-y-2">
                  {["Store name", "Platforms", "Delivery time", "Access format", "Replacement policy", "Restricted regions", "Sourcing", "Contact policy"].map(
                    (field) => (
                      <div key={field} className="flex items-center gap-2 text-sm">
                        <Shield className="size-3.5 text-muted-foreground" />
                        {field}
                      </div>
                    ),
                  )
                }
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Operations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="size-5" />
              Operations
            </CardTitle>
            <CardDescription>Platform-wide operational controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">Maintenance mode</p>
                <p className="text-xs text-muted-foreground">
                  Takes the marketplace offline for buyers. Sellers can still manage listings.
                </p>
              </div>
              <Switch checked={maintenance} onCheckedChange={setMaintenance} />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">New signups</p>
                <p className="text-xs text-muted-foreground">
                  Allow new account registrations.
                </p>
              </div>
              <Switch defaultChecked className="rounded-xl" />
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-lg">
                <Download className="size-4" />
                Export reports
              </Button>
              <Button type="button" variant="outline" className="rounded-lg">
                <Users className="size-4" />
                View audit log
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" className="rounded-xl">
            Reset to defaults
          </Button>
          <Button type="submit" className="rounded-xl">
            Save all settings
          </Button>
        </div>
      </form>
    </DashLayout>
  );
}
