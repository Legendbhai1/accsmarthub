import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * The admin listing queue has to work on the database production actually is,
 * not only on one built from every migration.
 *
 * Production ran `0001`-`0006` then `0013`+, so it skipped `0007`-`0012` and
 * therefore also `0020`, which is what gives listings their moderation columns
 * and the three-argument `set_listing_status`. Both of those were assumed by
 * the console, and both failed on production:
 *
 *   * `set_listing_status(p_listing_id, p_note, p_status)` -> `PGRST202`,
 *     "Could not find the function ... in the schema cache", so Approve and
 *     Reject did nothing at all;
 *   * `select ... moderation_note ...` -> `42703`, "column
 *     listings.moderation_note does not exist", so the queue never loaded.
 *
 * These pin the fallback in the source. A unit test cannot reach the real
 * PostgREST instance, and a mocked client would only prove the mock behaves as
 * the test wrote it — so the assertion is that the code asks for the older
 * shape when the newer one is refused.
 */
describe("set_listing_status falls back to the two-argument signature", () => {
  const source = read("src/lib/supabaseMutations.ts");
  const body = source.slice(
    source.indexOf("export async function setListingStatus"),
    source.indexOf("export type AdminUpdateListingInput"),
  );

  it("tries the note-bearing call first", () => {
    expect(body).toMatch(/p_listing_id: input\.listingId/);
    expect(body).toMatch(/p_status: input\.status/);
    expect(body).toMatch(/p_note: input\.note \?\? null/);
  });

  it("retries without the note when the signature is not found", () => {
    // The retry is what makes Approve work on the pre-0020 database.
    expect(body).toMatch(/isMissingRpcError\(withNote\.error\)/);
    expect(body).toMatch(/const withoutNote = await supabase\.rpc\("set_listing_status"/);
    // The retry passes the two named arguments the older function declares.
    expect(body).toMatch(/p_listing_id: input\.listingId,\s*\n\s*p_status: input\.status,\s*\n\s*\}\)/);
  });

  it("recognises PGRST202 as a missing function", () => {
    const helper = source.slice(
      source.indexOf("function isMissingRpcError"),
      source.indexOf("export type AdminUpdateListingInput"),
    );
    expect(helper).toMatch(/PGRST202/);
    expect(helper).toMatch(/could not find the function/i);
  });

  it("still reports a real failure instead of swallowing it", () => {
    // A permission error, a validation error, anything else must surface. Only
    // the "function not found" shape triggers the retry.
    expect(body).toMatch(/if \(!isMissingRpcError\(withNote\.error\)\)/);
    expect(body).toMatch(/throw new Error\(friendlyError\(/);
  });
});

describe("admin_update_listing degrades with a readable message", () => {
  const source = read("src/lib/supabaseMutations.ts");
  const body = source.slice(source.indexOf("export async function adminUpdateListing"));

  it("explains the migration instead of surfacing PGRST202", () => {
    expect(body).toMatch(/isMissingRpcError\(error\)/);
    expect(body).toMatch(/latest database migration/i);
    expect(body).toMatch(/Approving and rejecting still work/i);
  });
});

describe("the listing queue tolerates a database without the moderation columns", () => {
  const page = read("src/pages/admin/AdminListings.tsx");

  it("asks for moderation_note first", () => {
    expect(page).toMatch(/moderation_note/);
  });

  it("falls back to the columns that always exist", () => {
    // Two explicit selects: PostgREST derives the row type from the literal, so
    // a composed string would collapse the result type to a parser error.
    const selects = page.match(/\.select\(/g) ?? [];
    expect(selects.length).toBeGreaterThanOrEqual(2);
    expect(page).toMatch(/isSchemaCacheError\(result\.error\)/);
  });

  it("recognises 42703 as a missing column, via the shared helper", () => {
    // One definition of "the schema is behind", reused by the store-application
    // retry and this queue, so the two cannot drift.
    expect(page).toMatch(/isSchemaCacheError/);
    expect(page).not.toMatch(/function isMissingColumnError/);
    const lib = read("src/lib/supabaseMutations.ts");
    const helper = lib.slice(
      lib.indexOf("export function isSchemaCacheError"),
      lib.indexOf("export function isSchemaCacheError") + 500,
    );
    expect(helper).toMatch(/42703/);
    expect(helper).toMatch(/column .* does not exist/i);
  });

  it("treats the note as optional on the row", () => {
    // It is absent on the fallback read, so the type must not promise it.
    expect(page).toMatch(/moderation_note\?:/);
  });

  it("still offers approve and reject, which do not need 0020's columns", () => {
    expect(page).toMatch(/label: "Approve", next: "active"/);
    expect(page).toMatch(/label: "Reject", next: "paused"/);
  });
});
