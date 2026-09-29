import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo, type ReactNode } from "react";

const CONVEX_URL =
  (import.meta.env.VITE_CONVEX_URL as string | undefined) ??
  "https://aware-alligator-968.convex.cloud";

/** Mounts the Convex client once for the whole app. */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => new ConvexReactClient(CONVEX_URL), []);
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
