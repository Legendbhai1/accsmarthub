import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { auditLog } from "@/lib/db";

export default function AdminAudit() {
  return (
    <DashLayout title="Audit log" nav={adminNav}>
      <div className="glass overflow-hidden">
        <ul className="divide-y divide-border/60">
          {auditLog.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 text-sm">
              <code className="rounded-lg bg-muted/60 px-2 py-0.5 text-xs font-semibold text-primary">
                {entry.action}
              </code>
              <span className="text-muted-foreground">
                by <span className="font-medium text-foreground">{entry.actor}</span> on{" "}
                <span className="font-medium text-foreground">{entry.target}</span>
              </span>
              <time className="ml-auto text-xs text-muted-foreground">
                {new Date(entry.date).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Every privileged action is appended to an immutable, server-side audit
        trail in production.
      </p>
    </DashLayout>
  );
}
