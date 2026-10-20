import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUYER_FEE_RATE,
  COMMISSION_RATE,
  cartTotals,
} from "@/lib/cartTotals";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("cart totals", () => {
  it("charges the buyer the subtotal plus the 3% protection fee", () => {
    const t = cartTotals([{ unitPriceUsd: 100, quantity: 1 }]);
    expect(t.subtotalUsd).toBe(100);
    expect(t.buyerFeeUsd).toBe(3);
    expect(t.totalUsd).toBe(103);
  });

  it("does not add commission to the buyer's total", () => {
    // Commission comes out of the seller's side. Charging it to the buyer as
    // well would double-collect it.
    const t = cartTotals([{ unitPriceUsd: 100, quantity: 1 }]);
    expect(t.commissionUsd).toBe(10);
    expect(t.sellerNetUsd).toBe(90);
    expect(t.totalUsd).toBe(103);
  });

  it("multiplies the unit price by the quantity", () => {
    const t = cartTotals([{ unitPriceUsd: 12.5, quantity: 4 }]);
    expect(t.subtotalUsd).toBe(50);
    expect(t.buyerFeeUsd).toBe(1.5);
  });

  it("sums several lines before applying the fee", () => {
    const t = cartTotals([
      { unitPriceUsd: 10, quantity: 2 },
      { unitPriceUsd: 5, quantity: 1 },
    ]);
    expect(t.subtotalUsd).toBe(25);
    expect(t.buyerFeeUsd).toBe(0.75);
  });

  it("rounds to cents and stays consistent with the charge", () => {
    // 33.33 * 3% = 0.9999 -> 1.00. The total must equal subtotal + the rounded
    // fee, or the buyer is shown a figure that is a cent off the debit.
    const t = cartTotals([{ unitPriceUsd: 33.33, quantity: 1 }]);
    expect(t.buyerFeeUsd).toBe(1);
    expect(t.totalUsd).toBe(34.33);
    expect(t.totalUsd).toBe(
      Math.round((t.subtotalUsd + t.buyerFeeUsd) * 100) / 100,
    );
  });

  it("is zero for an empty cart", () => {
    expect(cartTotals([])).toEqual({
      subtotalUsd: 0,
      buyerFeeUsd: 0,
      totalUsd: 0,
      commissionUsd: 0,
      sellerNetUsd: 0,
    });
  });

  it("keeps its rates in step with the SQL that actually charges them", () => {
    // The client may only display these numbers; the RPC recomputes them. If
    // someone changes the rate in one place and not the other, the summary on
    // screen silently disagrees with the amount debited.
    const sql = readdirSync("supabase/migrations")
      .filter((n) => n.endsWith(".sql"))
      .map((n) => read(`supabase/migrations/${n}`))
      .join("\n");
    const buyerFees = sql.match(/round\([^)]*\*\s*0\.03\s*,\s*2\)/gi) ?? [];
    const commissions = sql.match(/\*\s*0\.10\s*,\s*2\)/gi) ?? [];
    expect(buyerFees.length).toBeGreaterThan(0);
    expect(commissions.length).toBeGreaterThan(0);
    expect(BUYER_FEE_RATE).toBe(0.03);
    expect(COMMISSION_RATE).toBe(0.1);
  });
});

describe("the cart is wired to the server, not to component state", () => {
  const mutations = read("src/lib/supabaseMutations.ts");
  const cartPage = read("src/pages/buyer/BuyerCart.tsx");
  const listing = read("src/pages/public/ListingDetail.tsx");

  it("writes quantities through the RPCs rather than the table", () => {
    // A direct insert into `cart_items` would let the client choose the price
    // column; the RPC re-reads the listing and validates the quantity.
    expect(mutations).toMatch(/\.rpc\("cart_add"/);
    expect(mutations).toMatch(/\.rpc\("cart_set"/);
    expect(mutations).toMatch(/\.rpc\("cart_remove"/);
    expect(mutations).toMatch(/\.rpc\("checkout"/);
  });

  it("checks out by listing id, never by a client-supplied price", () => {
    // The payload carries ids only. There is no price, total or seller id in
    // the request that the server could be tricked into trusting.
    expect(cartPage).toMatch(/cartIds:\s*lines\.map\(\(line\) => line\.listingId\)/);
    expect(cartPage).not.toMatch(/checkoutCart\(\{[^}]*price/);
    expect(cartPage).not.toMatch(/checkoutCart\(\{[^}]*total/);
  });

  it("sends an idempotency key so a retry cannot double-charge", () => {
    expect(mutations).toMatch(/crypto\.randomUUID\(\)/);
  });

  it("hides the cart where the database cannot store one", () => {
    // Production has no `cart_items` table, so an unconditional cart button
    // would be a control that can only fail.
    expect(listing).toMatch(/cartAvailable\s*&&/);
    expect(cartPage).toMatch(/!cartAvailable/);
  });

  it("renders the add-to-cart animation only after the write resolves", () => {
    // `justAdded` is set inside the `try`, after `await cartAdd`. Setting it
    // from the click would animate a success that has not happened.
    const handler = listing.slice(listing.indexOf("const addToCart"));
    const body = handler.slice(0, handler.indexOf("};"));
    expect(body.indexOf("await cartAdd")).toBeLessThan(
      body.indexOf("setJustAdded(true)"),
    );
  });
});

describe("the cart page renders every state", () => {
  const cartPage = read("src/pages/buyer/BuyerCart.tsx");

  it("has loading, unsupported, error, empty and ready branches", () => {
    expect(cartPage).toMatch(/cartQuery\.loading/);
    expect(cartPage).toMatch(/!cartAvailable/);
    expect(cartPage).toMatch(/cartQuery\.error/);
    expect(cartPage).toMatch(/lines\.length === 0/);
    expect(cartPage).toMatch(/cartQuery\.refresh/);
  });

  it("blocks checkout when a line is no longer buyable", () => {
    // Server re-checks too, but the buyer should not be able to press a button
    // that is certain to fail.
    expect(cartPage).toMatch(/blocked\.length > 0/);
    expect(cartPage).toMatch(/line\.status !== "active" \|\| line\.stock < line\.quantity/);
  });
});
