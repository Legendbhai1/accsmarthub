import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * What the connected database can actually store.
 *
 * The client is deployed from this repository; the database is migrated
 * separately. The two can be out of step, and on this project they are:
 * production ran `0001`-`0006` and then `0013`+, so migration `0017`'s `stores`
 * columns have never existed there.
 *
 * The application wizard used to discover that only at submit time. The insert
 * was refused with a PostgREST schema-cache error, silently retried without the
 * new columns, and the seller was told their categories, warranty and refund
 * policy had been dropped — after they had typed them. Asking the database
 * first is the honest fix: the wizard can then ask only for answers that will
 * be kept.
 *
 * PostgREST validates the columns in a `select` before it applies row-level
 * security, so a zero-row probe of one representative column is a cheap,
 * authenticated capability check. It returns `42703` for a column that does not
 * exist and `PGRST205` for a table that does not exist, both of which are
 * definitive; anything else (offline, expired token) is treated as "unknown"
 * and the optimistic default is used, because the write path already has a
 * retry for that case.
 */
export type DbCapabilities = {
  /** `stores.categories`, `warranty_hours`, `refund_policy` — added by 0017. */
  storeApplicationFields: boolean;
  /** The `store_application_events` history table, added by 0017. */
  storeApplicationEvents: boolean;
  /** The `cart_items` table and the `cart_*` / `checkout` RPCs, added by 0013. */
  cart: boolean;
};

/**
 * The default assumes every migration has run.
 *
 * It is the safe default in both directions: on a fully migrated database it is
 * correct, and on an older one the write path still degrades gracefully rather
 * than breaking. The alternative — assuming the *worst* — would hide working
 * features from every user whenever a probe happens to fail.
 */
export const FULL_CAPABILITIES: DbCapabilities = {
  storeApplicationFields: true,
  storeApplicationEvents: true,
  cart: true,
};

function isMissingColumnOrTable(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /column .* does not exist/i.test(message) ||
    /could not find the .*column/i.test(message) ||
    /could not find the table/i.test(message) ||
    /relation .* does not exist/i.test(message)
  );
}

/** True when `table.column` is selectable, false when it does not exist. */
async function columnExists(table: string, column: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(column).limit(0);
  if (!error) return true;
  if (isMissingColumnOrTable(error)) return false;
  throw error;
}

/** True when the table is selectable, false when it does not exist. */
async function tableExists(table: string): Promise<boolean> {
  const { error } = await supabase.from(table).select("*").limit(0);
  if (!error) return true;
  if (isMissingColumnOrTable(error)) return false;
  throw error;
}

/**
 * Probe the database once per page load.
 *
 * The in-flight promise is cached rather than the result, so two components
 * mounting together share one set of requests instead of racing three each.
 * A rejected probe is evicted so a later caller can retry after a network blip.
 */
let cached: Promise<DbCapabilities> | null = null;

export function detectCapabilities(): Promise<DbCapabilities> {
  if (cached) return cached;
  cached = (async () => {
    try {
      const [storeApplicationFields, storeApplicationEvents, cart] =
        await Promise.all([
          columnExists("stores", "agreement_version"),
          tableExists("store_application_events"),
          tableExists("cart_items"),
        ]);
      return { storeApplicationFields, storeApplicationEvents, cart };
    } catch {
      return FULL_CAPABILITIES;
    }
  })();
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

/** Test seam — drops the memoised probe so a spec can re-run detection. */
export function resetCapabilitiesCache() {
  cached = null;
}

/**
 * The probe as a hook.
 *
 * Returns the optimistic defaults until the probe resolves, so a component
 * never flashes a "not supported" state at a user whose database is fine.
 */
export function useCapabilities(): DbCapabilities {
  const [caps, setCaps] = useState<DbCapabilities>(FULL_CAPABILITIES);
  useEffect(() => {
    let alive = true;
    detectCapabilities().then((c) => {
      if (alive) setCaps(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return caps;
}
