import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/supabaseData";
import { toast } from "sonner";

/**
 * Account settings.
 *
 * This used to be a stub: submitting fired `toast.success("Profile saved
 * (demo)")` and wrote nothing anywhere, so whatever you typed here was gone
 * on the next page load and the header kept showing the old name.
 *
 * The three fields have three different homes, because that is how Supabase
 * is built:
 *
 *   name     -> `profiles.name`. The column grant is deliberately narrow —
 *               `grant update (name) on public.profiles to authenticated` —
 *               so this is the only profile column a signed-in user can
 *               write, and `guard_profile_privileges` blocks `is_admin`.
 *   email    -> `auth.users`, via `updateUser`. This project has
 *               `mailer_secure_email_change_enabled = true`, so the new
 *               address only becomes the account address once its
 *               confirmation link is opened. The UI has to say so.
 *   password -> `auth.users`, via `updateUser`. GoTrue may answer
 *               `reauth_needed` if the session is not fresh enough; that is
 *               reported as "sign out and back in", not as a silent failure.
 */
export default function BuyerProfile() {
  const { user, refresh } = useSession();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const emailChanged = !!user && trimmedEmail !== user.email.toLowerCase();
  const passwordChanged = password.length > 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const done: string[] = [];
    try {
      if (trimmedName && trimmedName !== user.name) {
        // `select().single()` is not decoration: with the narrow column grant
        // an update touching a forbidden column is rejected by the database,
        // and this is where that surfaces as a readable error.
        const { error } = await supabase
          .from("profiles")
          .update({ name: trimmedName })
          .eq("id", user.id)
          .select("name")
          .single();
        if (error) throw new Error(friendlyError(error));
        done.push("name");
      }

      if (emailChanged) {
        const { error } = await supabase.auth.updateUser({
          email: trimmedEmail,
        });
        if (error) throw new Error(friendlyError(error));
      }

      if (passwordChanged) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          if (/reauth|reauthentication|session/i.test(error.message)) {
            throw new Error(
              "For security, sign out and sign in again before changing your password.",
            );
          }
          throw new Error(friendlyError(error));
        }
      }

      // Re-read the profile so the header avatar and the greeting above the
      // form show the new name without a full reload.
      await refresh();

      if (done.length) toast.success("Profile saved.");
      if (emailChanged)
        toast.success("Confirmation sent.", {
          description: `Open the link in ${trimmedEmail} to finish changing your address.`,
        });
      if (passwordChanged) toast.success("Password changed.");
      if (!done.length && !emailChanged && !passwordChanged)
        toast.info("Nothing to save.", {
          description: "Your details are already up to date.",
        });

      // Clear the password field either way so it is not left sitting in the
      // DOM after a successful change.
      setPassword("");
    } catch (err) {
      toast.error("Could not save your profile", {
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

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

        <form className="glass space-y-4 p-6" onSubmit={save}>
          <h3 className="font-semibold">Account details</h3>

          <div className="grid gap-2">
            <Label htmlFor="profile-name">Full name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="inset-well rounded-xl border-border/60"
              autoComplete="name"
            />
            <p className="text-xs text-muted-foreground">
              Shown to sellers on your orders and disputes.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="inset-well rounded-xl border-border/60"
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">
              {emailChanged
                ? "Changing this sends a confirmation link to the new address — the address only changes once you open it."
                : "Also where deposit and account emails are sent."}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-password">New password</Label>
            <Input
              id="profile-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current"
              className="inset-well rounded-xl border-border/60"
              autoComplete="new-password"
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">
              At least 8 characters. Stored hashed by Supabase Auth — it is
              never sent anywhere from this page.
            </p>
          </div>

          <Button type="submit" className="rounded-xl" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </form>
      </div>
    </DashLayout>
  );
}
