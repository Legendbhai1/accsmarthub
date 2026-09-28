import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export default function BuyerProfile() {
  const { user } = useSession();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  return (
    <DashLayout title="Profile" nav={buyerNav}>
      <div className="max-w-xl space-y-6">
        <div className="glass p-6">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-xl font-bold text-primary">
              {user?.name?.charAt(0) ?? "M"}
            </span>
            <div>
              <p className="font-semibold">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </div>

        <form
          className="glass space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            toast.success("Profile saved (demo)");
          }}
        >
          <h3 className="font-semibold">Account details</h3>
          <div className="grid gap-2">
            <Label htmlFor="profile-name">Full name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="inset-well rounded-xl border-border/60"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="inset-well rounded-xl border-border/60"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-password">New password</Label>
            <Input
              id="profile-password"
              type="password"
              placeholder="Leave blank to keep current"
              className="inset-well rounded-xl border-border/60"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Passwords are hashed server-side; this form is UI only in the
              demo.
            </p>
          </div>
          <Button type="submit" className="rounded-xl">
            Save changes
          </Button>
        </form>
      </div>
    </DashLayout>
  );
}
