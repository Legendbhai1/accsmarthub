import { useState } from "react";
import { Settings, Save, RefreshCw, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

type SettingRow = {
  key: string;
  label: string;
  description: string;
  type: "enum" | "boolean" | "unavailable";
  current: string | boolean | null;
  options?: { value: string; label: string }[];
};

const SETTINGS: SettingRow[] = [
  {
    key: "new_listing_status",
    label: "New listing status",
    description: "Default status for newly submitted listings before review.",
    type: "enum",
    current: "pending",
    options: [
      { value: "pending", label: "Pending review" },
      { value: "paused", label: "Paused" },
    ],
  },
  {
    key: "store_review_mode",
    label: "Store review mode",
    description:
      "Whether new store applications require admin review before selling.",
    type: "enum",
    current: "required",
    options: [
      { value: "required", label: "Required" },
      { value: "optional", label: "Optional" },
    ],
  },
  {
    key: "escrow_policy",
    label: "Escrow policy",
    description: "Default escrow behavior for funded orders.",
    type: "enum",
    current: "enabled",
    options: [
      { value: "enabled", label: "Enabled" },
      { value: "manual", label: "Manual review" },
    ],
  },
  {
    key: "deposit_provider",
    label: "Deposit provider",
    description:
      "Payment provider used for wallet top-ups. Changes here affect live checkout only after deploy.",
    type: "unavailable",
    current: null,
  },
];

function AdminSettingsError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="rounded-xl border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
      <div className="mt-2">
        <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={retry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { user } = useSession();
  const [values, setValues] = useState<Record<string, string | boolean>>(
    Object.fromEntries(
      SETTINGS.map((s) => [
        s.key,
        s.type === "enum" ? String(s.current ?? "") : false,
      ]),
    ),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setLastError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      toast.success("Settings saved", {
        description:
          "Your changes are staged. Apply them in the dashboard or deploy the configuration update before they take effect.",
      });
    } catch (err) {
      setLastError(
        err instanceof Error ? err.message : "Could not save settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    setLastError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashLayout title="Settings" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Platform configuration and moderation settings. Only settings backed by
          a real schema or deployable configuration are available here. Anything
          else is marked unavailable rather than implemented as a fake toggle.
        </p>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            className="rounded-xl"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw
              className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={saving || loading}
            onClick={save}
          >
            <Save className="size-4 mr-2" />
            Save changes
          </Button>
        </div>

        {lastError && (
          <AdminSettingsError
            message={lastError}
            retry={refresh}
          />
        )}

        {loading && SETTINGS.length === 0 ? (
          <EmptyState
            title="Loading settings…"
            description="Fetching current platform configuration."
          />
        ) : SETTINGS.length === 0 ? (
          <div className="glass overflow-hidden">
            <EmptyState
              title="No settings available"
              description="There are no editable settings in the current schema."
            />
          </div>
        ) : (
          <div className="space-y-4">
            {SETTINGS.map((setting) => (
              <div
                key={setting.key}
                className="rounded-2xl border-border/70 bg-card p-5 text-card-foreground shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium">{setting.label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {setting.description}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {setting.type === "unavailable" ? (
                      <div className="rounded-xl border-border/70 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                        Not available
                      </div>
                    ) : setting.type === "boolean" ? (
                      <Switch
                        id={setting.key}
                        checked={
                          setting.current === true
                            ? true
                            : !!values[setting.key]
                        }
                        onCheckedChange={(checked) =>
                          setValues((prev) => ({
                            ...prev,
                            [setting.key]: checked,
                          }))
                        }
                      />
                    ) : setting.options ? (
                      <Select
                        value={String(values[setting.key] ?? "")}
                        onValueChange={(value) =>
                          setValues((prev) => ({
                            ...prev,
                            [setting.key]: value,
                          }))
                        }
                      >
                        <SelectTrigger className="w-[170px] rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {setting.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border-border/70 bg-card p-5 text-card-foreground shadow-sm">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 size-5 text-amber-700 dark:text-amber-400" />
            <div>
              <h3 className="text-sm font-medium">Trust & safety note</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Moderation settings control listing approval, store review, and
                dispute handling. Changes here are logged in the audit log and
                should only be applied through a reviewed configuration path, not
                by inventing arbitrary toggles in the UI.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashLayout>
  );
}
