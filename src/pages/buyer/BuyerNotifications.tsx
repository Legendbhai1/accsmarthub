import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { api, useDb } from "@/lib/db";

export default function BuyerNotifications() {
  const { notifications } = useDb();
  const mine = notifications.filter((n) => n.userId === "u-me");

  return (
    <DashLayout title="Notifications" nav={buyerNav}>
      {mine.length === 0 ? (
        <EmptyState title="No notifications" description="Order updates will appear here." />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => api.markNotificationsRead("u-me")}
            >
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          </div>
          <ul className="space-y-2.5">
            {mine.map((n) => (
              <li
                key={n.id}
                className={`glass flex items-start gap-3 p-4 ${n.read ? "opacity-70" : ""}`}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Bell className="size-4 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {n.title}
                    {!n.read && <span className="ml-2 inline-block size-1.5 rounded-full bg-primary align-middle" />}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {new Date(n.date).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashLayout>
  );
}
