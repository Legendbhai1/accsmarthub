/**
 * AccsMartHub — admin-users Edge Function
 *
 * Server-side replacement for calling supabase.auth.admin.getUserById(...) in
 * the browser. The service-role key must never reach the client bundle.
 *
 * Flow:
 *   1. Validate the caller's Supabase JWT (Authorization: Bearer <access_token>).
 *   2. Independently verify profiles.is_admin with the service-role client.
 *   3. Call public.admin_list_users(...) with the CALLER's token, so the
 *      database's can_moderate() check runs as well (defence in depth).
 *
 * Request (GET query string or POST JSON):
 *   { page?: number, per_page?: number, role?: "all"|"admin"|"seller"|"buyer", search?: string }
 *   `status` is accepted as a legacy alias for `role`.
 *
 * Response 200: { users: [{ id, email, name, last_sign_in_at, role }], total, page, per_page }
 * Response 400: invalid input. 401: no/invalid token. 403: not an admin.
 * Response 500: server failure (details stay in server logs).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const ROLES = ["all", "admin", "seller", "buyer"] as const;
type RoleFilter = (typeof ROLES)[number];

interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  last_sign_in_at: string | null;
  role: string;
}

interface AdminUsersPayload {
  users: AdminUserRow[];
  total: number;
  page: number;
  per_page: number;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function toInt(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseRequest(req: Request): Record<string, unknown> {
  const url = new URL(req.url);
  const fromQuery: Record<string, unknown> = {};
  for (const key of ["page", "per_page", "role", "status", "search"]) {
    const v = url.searchParams.get(key);
    if (v !== null) fromQuery[key] = v;
  }
  // GET has no body; query string is the whole request.
  if (req.method === "GET") return fromQuery;
  return fromQuery;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "[admin-users] Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY. " +
        "The service-role key must be set as an Edge Function secret.",
    );
    return json({ error: "Admin users service is not configured" }, 503);
  }

  try {
    // ---------- input ----------
    let raw: Record<string, unknown> = parseRequest(req);
    if (req.method === "POST") {
      const text = await req.text();
      if (text.trim()) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return json({ error: "Body must be a JSON object" }, 400);
        }
        raw = { ...(parsed as Record<string, unknown>), ...raw };
      }
    }

    const roleRaw = String(raw.role ?? raw.status ?? "all").toLowerCase();
    if (!ROLES.includes(roleRaw as RoleFilter)) {
      return json({ error: "role must be one of: all, admin, seller, buyer" }, 400);
    }
    const role = roleRaw as RoleFilter;

    const searchRaw = raw.search;
    if (searchRaw !== undefined && typeof searchRaw !== "string") {
      return json({ error: "search must be a string" }, 400);
    }
    const search = (searchRaw ?? "").trim().slice(0, 100);

    const page = Math.max(1, toInt(raw.page, 1));
    const perPage = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, toInt(raw.per_page, DEFAULT_PAGE_SIZE)),
    );

    // ---------- 1. verify the caller's JWT ----------
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ error: "Missing bearer token" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    const callerId = userData?.user?.id;
    if (userError || !callerId) {
      return json({ error: "Invalid or expired session" }, 401);
    }

    // ---------- 2. independently verify admin ----------
    const adminClient: SupabaseClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("id", callerId)
      .maybeSingle();

    if (profileError) {
      console.error("[admin-users] profile lookup failed:", profileError.message);
      return json({ error: "Could not verify admin access" }, 500);
    }
    if (callerProfile?.is_admin !== true) {
      return json({ error: "Forbidden: admin access required" }, 403);
    }

    // ---------- 3. paginated read, enforced again in the database ----------
    const { data: rows, error: rpcError } = await userClient.rpc("admin_list_users", {
      p_search: search,
      p_role: role,
      p_limit: perPage,
      p_offset: (page - 1) * perPage,
    });

    if (rpcError) {
      console.error(
        "[admin-users] admin_list_users failed:",
        rpcError.code,
        rpcError.message,
      );
      return json({ error: "Could not load users" }, 500);
    }

    const list = (Array.isArray(rows) ? rows : []) as Array<Record<string, unknown>>;
    const total = list.length > 0 ? Number(list[0].total_count ?? 0) : 0;

    const payload: AdminUsersPayload = {
      users: list.map((r) => ({
        id: String(r.id),
        email: typeof r.email === "string" ? r.email : null,
        name: typeof r.name === "string" ? r.name : null,
        last_sign_in_at:
          typeof r.last_sign_in_at === "string" ? r.last_sign_in_at : null,
        role: typeof r.role === "string" ? r.role : "buyer",
      })),
      total,
      page,
      per_page: perPage,
    };

    return json(payload);
  } catch (err) {
    console.error("[admin-users] unexpected error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
