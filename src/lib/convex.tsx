import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { useMemo, type ReactNode } from "react";

const CONVEX_URL =
  (import.meta.env.VITE_CONVEX_URL as string | undefined) ??
  "https://aware-alligator-968.convex.cloud";

/**
 * Mounts the Convex client once for the whole app, wrapped in Convex Auth so
 * sessions, the email-OTP verification flow and token refresh all work.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => new ConvexReactClient(CONVEX_URL), []);
  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}