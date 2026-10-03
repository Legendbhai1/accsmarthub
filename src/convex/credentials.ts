import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { internal as internalApi } from "./_generated/api";
import { assertVerified, requireAccount, requireAuthId, requireApprovedStore } from "./lib";

/**
 * The credential vault.
 *
 * Sellers attach account credentials to a listing. Buyers download them after
 * paying. Three rules shape the design:
 *
 *  1. ENCRYPTED AT REST. Credentials are AES-256-GCM encrypted before they
 *     touch the database. A leaked database row is useless without the key.
 *
 *  2. ONE ROW PER UNIT, NOT PER ORDER. A listing with 50 units in stock needs
 *     50 distinct accounts — handing the same username and password to two
 *     buyers means the second receives an account whose password the first
 *     already changed. Rows are created once when the seller uploads, so
 *     storage tracks units held, not sales made.
 *
 *  3. RESERVED AT CHECKOUT. `reserveUnits` claims specific unclaimed units in
 *     the same transaction that writes the order, so two buyers can never be
 *     given the same account.
 *
 * The decryption key lives in an environment variable and is only ever read
 * inside a server action. There is deliberately no query that returns
 * credential plaintext to any client.
 */

/** Fetches the AES-256 key as raw bytes. */
async function getKey(): Promise<CryptoKey> {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Credential storage is not configured. Set CREDENTIALS_ENCRYPTION_KEY in your Convex environment variables.",
    );
  }
  // Accept 64 hex chars (32 bytes) directly; hash anything else to a fixed
  // 32-byte key so a short passphrase can never silently under-key AES.
  const bytes =
    /^[0-9a-f]{64}$/i.test(raw)
      ? Uint8Array.from((raw.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)))
      : new TextEncoder().encode(raw);
  const material =
    bytes.length === 32 ? bytes : new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return crypto.subtle.importKey("raw", material as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encrypt(plain: string) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  // WebCrypto appends the 16-byte tag to the ciphertext.
  const all = new Uint8Array(buf);
  return {
    ciphertext: btoa(String.fromCharCode(...all.slice(0, all.length - 16))),
    iv: btoa(String.fromCharCode(...iv)),
    authTag: btoa(String.fromCharCode(...all.slice(all.length - 16))),
  };
}

export const decryptCredential = async (payload: {
  ciphertext: string;
  iv: string;
  authTag: string;
}) => {
  const key = await getKey();
  const ciphertext = Uint8Array.from(atob(payload.ciphertext), (c) => c.charCodeAt(0));
  const authTag = Uint8Array.from(atob(payload.authTag), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(payload.iv), (c) => c.charCodeAt(0));
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, combined),
  );
};

/** Rejects an empty, oversized or link-bearing credential file. */
function validateCredentialText(raw: string) {
  const text = raw.trim();
  if (!text) throw new Error("Credentials cannot be empty.");
  if (text.length > 20_000) {
    throw new Error("Credentials file is too large (20KB maximum).");
  }
  // Credentials are the one place a contact detail is legitimate — it IS the
  // deliverable. But a link out of the vault would let a seller hand over a
  // dead account and move the buyer off-platform, so reject URLs outright.
  if (/https?:\/\//i.test(text)) {
    throw new Error(
      "Do not include links in the credentials file — deliver the account details only.",
    );
  }
  return text;
}

/**
 * Seller uploads one credential file per unit in stock.
 *
 * Each entry in `files` becomes its own encrypted row with its own unitKey.
 * Uploading replaces the listing's unclaimed inventory; units already reserved
 * by a paid order are left untouched so an in-flight buyer is never affected.
 */
export const setCredentials = mutation({
  args: {
    listingId: v.string(),
    files: v.array(
      v.object({ unitKey: v.string(), credentials: v.string(), fileName: v.optional(v.string()) }),
    ),
  },
  handler: async (ctx, args) => {
    const account = await requireAccount(ctx);
    assertVerified(account);
    await requireApprovedStore(ctx, account.id);

    const listing = await ctx.db
      .query("listingStock")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .unique();
    if (!listing) throw new Error("Listing not found.");
    if (listing.sellerId !== account.id) {
      throw new Error("You can only attach credentials to your own listings.");
    }

    const existing = await ctx.db
      .query("listingCredentials")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .collect();

    // Drop unclaimed rows the seller no longer supplied. Claimed rows are
    // retained: a paid buyer must keep access to their account.
    const claimed = existing.filter((r) => r.claimedByOrderNo);
    const claimedKeys = new Set(claimed.map((r) => r.unitKey));
    for (const row of existing) {
      if (!row.claimedByOrderNo) await ctx.db.delete(row._id);
    }

    const seen = new Set<string>();
    let added = 0;
    for (const file of args.files) {
      const unitKey = file.unitKey.trim();
      if (!unitKey) throw new Error("Each credential file needs a unit reference.");
      if (seen.has(unitKey)) {
        throw new Error(`Duplicate unit reference: ${unitKey}.`);
      }
      if (claimedKeys.has(unitKey)) {
        throw new Error(
          `Unit ${unitKey} is already reserved by a paid order and cannot be replaced.`,
        );
      }
      seen.add(unitKey);
      const encrypted = await encrypt(validateCredentialText(file.credentials));
      await ctx.db.insert("listingCredentials", {
        listingId: args.listingId,
        sellerId: account.id,
        unitKey,
        ...encrypted,
        fileName: file.fileName?.trim() || `${unitKey}.txt`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      added += 1;
    }

    return { unclaimedUnits: added, reservedUnits: claimed.length };
  },
});

/**
 * Seller-facing inventory summary. Returns counts and filenames only —
 * never credential contents.
 */
export const credentialStatus = query({
  args: { listingIds: v.array(v.string()) },
  handler: async (ctx, { listingIds }) => {
    const rows = await Promise.all(
      listingIds.map(async (listingId) => {
        const all = await ctx.db
          .query("listingCredentials")
          .withIndex("by_listing", (q) => q.eq("listingId", listingId))
          .collect();
        const unclaimed = all.filter((r) => !r.claimedByOrderNo);
        return {
          listingId,
          attached: all.length > 0,
          totalUnits: all.length,
          availableUnits: unclaimed.length,
          reservedUnits: all.length - unclaimed.length,
          fileNames: all.slice(0, 20).map((r) => r.fileName),
        };
      }),
    );
    const out: Record<
      string,
      {
        attached: boolean;
        totalUnits: number;
        availableUnits: number;
        reservedUnits: number;
        fileNames: string[];
      }
    > = {};
    for (const row of rows) {
      out[row.listingId] = {
        attached: row.attached,
        totalUnits: row.totalUnits,
        availableUnits: row.availableUnits,
        reservedUnits: row.reservedUnits,
        fileNames: row.fileNames,
      };
    }
    return out;
  },
});

/** Return shape of the download action. */
type DownloadedCredential = { unitKey: string; fileName: string; content: string };

type AuthorizedOrder = {
  orderNo: string;
  listingId: string;
  sellerId: string;
} | null;

/**
 * Buyer-facing download.
 *
 * An action rather than a query because it needs the encryption key, and the
 * key must never be reachable from a reactive client query. The database-side
 * authorization lives in ./credentialStore.ts as internal functions, so a
 * browser cannot call it directly.
 */
export const downloadCredentials = action({
  args: { orderNo: v.string() },
  handler: async (
    ctx,
    { orderNo },
  ): Promise<{ files: DownloadedCredential[] }> => {
    const userId = await requireAuthId(ctx);

    const order: AuthorizedOrder = await ctx.runQuery(
      internalApi.credentialStore.authorizedDownload,
      { orderNo, userId },
    );
    if (!order) {
      throw new Error("Only the buyer of a paid order can download the credentials.");
    }

    const rows = await ctx.runQuery(internalApi.credentialStore.claimedUnits, {
      listingId: order.listingId,
      orderNo,
    });
    if (rows.length === 0) {
      throw new Error(
        "No credentials are reserved for this order. Contact support if you already paid.",
      );
    }

    const files: DownloadedCredential[] = [];
    for (const row of rows) {
      const content = await decryptCredential(row);
      files.push({
        unitKey: row.unitKey,
        fileName: row.fileName.endsWith(".txt") ? row.fileName : `${row.fileName}.txt`,
        content,
      });
    }

    await ctx.runMutation(internalApi.credentialStore.recordDownload, {
      orderNo: order.orderNo,
      listingId: order.listingId,
      unitKeys: rows.map((r) => r.unitKey),
      buyerId: userId,
      sellerId: order.sellerId,
    });

    return { files };
  },
});
