import { useSession, type SessionUser } from "@/lib/session";

type Props = {
  user?: SessionUser | null;
};

export default function AdminSettings(props: Props) {
  useSession();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      <p className="mt-2 text-muted-foreground">
        Platform configuration and moderation settings.
      </p>
    </div>
  );
}
