import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * The tick that fires after a purchase.
 *
 * Like the Lottie success signals it is a *success* mark, so the failure mode
 * that matters is showing it for a payment that did not happen. These pin the
 * gate in the source — the overlay looks identical whether it is shown for a
 * completed order or a rejected one, so a render test would not catch it, but
 * the ordering of `await` and the state flag does.
 */
describe("the purchase tick follows the server, not the click", () => {
  const checkout = read("src/pages/flow/Checkout.tsx");

  it("only reveals the tick after placeOrder has resolved", () => {
    const handler = checkout.slice(
      checkout.indexOf("const runPlaceOrder"),
      checkout.indexOf("const runPlaceOrder") + 1200,
    );
    const awaited = handler.indexOf("await placeOrder");
    const flagged = handler.indexOf("setPaid(true)");
    expect(awaited).toBeGreaterThan(-1);
    expect(flagged).toBeGreaterThan(awaited);
  });

  it("clears the success flag when the purchase is rejected", () => {
    // A retry after a failure must not inherit the previous attempt's tick.
    const handler = checkout.slice(
      checkout.indexOf("const runPlaceOrder"),
      checkout.indexOf("const runPlaceOrder") + 1200,
    );
    const caught = handler.indexOf("catch");
    expect(caught).toBeGreaterThan(-1);
    expect(handler.slice(caught)).toMatch(/setPaid\(false\)/);
    expect(handler).toMatch(/toast\.error/);
  });

  it("gates the overlay on that flag rather than on `placing`", () => {
    // `placing` is true for the whole request, including a request that will
    // fail; gating on it would flash a success mark for a doomed order.
    expect(checkout).toMatch(/\{paid && \(/);
    expect(checkout).toMatch(/<SuccessTick/);
  });

  it("holds the tick long enough to read but not to stall", () => {
    const m = checkout.match(/const TICK_HOLD_MS = (\d+);/);
    expect(m, "TICK_HOLD_MS should be a constant").not.toBeNull();
    const hold = Number(m![1]);
    // The check finishes drawing at ~520ms (0.2s delay + 0.32s stroke); under
    // that it is cut off mid-draw, and over ~1.4s it reads as a stall before a
    // page that was already ready.
    expect(hold).toBeGreaterThanOrEqual(600);
    expect(hold).toBeLessThanOrEqual(1400);
  });
});

describe("the confirmation page keeps a tick for a captured payment", () => {
  const source = read("src/pages/flow/OrderConfirmed.tsx");

  it("shows the seal only for a status that means the money is held", () => {
    // A refunded or expired order must not carry a "paid" mark. The guard is
    // the whole point: the mark looks identical whatever it sits beside.
    expect(source).toMatch(/<SuccessTick/);
    expect(source).toMatch(/order\.status === "in_escrow"/);
    expect(source).toMatch(/order\.status === "completed"/);
    expect(source).not.toMatch(/SuccessTick[\s\S]{0,200}status === "refunded"/);
  });

  it("mounts the seal inside the loaded-order branch", () => {
    // Same contract as the Lottie: nothing for an order that has not loaded.
    const sealAt = source.indexOf("<SuccessTick");
    const orderGuard = source.lastIndexOf("{order && (", sealAt);
    expect(orderGuard).toBeGreaterThan(-1);
  });
});

describe("the tick component honours the theme's motion rules", () => {
  const source = read("src/components/common/SuccessTick.tsx");
  const css = read("src/index.css");

  it("carries accessible text", () => {
    expect(source).toMatch(/role="img"/);
    expect(source).toMatch(/aria-label=/);
    // The artwork inside is decorative; the label above is the meaning.
    expect(source).toMatch(/aria-hidden="true"/);
  });

  it("keeps the tick, but drops the decorative ring, under reduced motion", () => {
    // The tick is the information ("the money moved"), so it stays; the
    // expanding ring is motion with nothing in it, so it goes.
    expect(source).toMatch(/useReducedMotion/);
    expect(source).toMatch(/\{!reduced && \(/);
    expect(source).toMatch(/tick-check-static/);
  });

  it("defines the three keyframes and the static reduced-motion variant", () => {
    for (const name of ["tick-pop", "tick-check", "tick-ring"]) {
      expect(css, `@keyframes ${name}`).toMatch(
        new RegExp(`@keyframes ${name} \\{`),
      );
    }
    // The static variant must neutralise the dash so the tick is visible
    // without the draw — a leftover `stroke-dasharray` would hide it.
    const staticRule = css.slice(css.indexOf(".tick-check-static"));
    expect(staticRule).toMatch(/stroke-dasharray:\s*none/);
    expect(staticRule).toMatch(/animation:\s*none/);
  });

  it("draws the check with the path's own length", () => {
    // `stroke-dasharray` must cover the whole path or the stroke is truncated;
    // the check is ~33 units, and the rule uses 34 for headroom.
    const rule = css.slice(css.indexOf("\n  .tick-check {"));
    const dash = rule.match(/stroke-dasharray:\s*([\d.]+)/);
    expect(dash).not.toBeNull();
    expect(Number(dash![1])).toBeGreaterThanOrEqual(33);
  });
});
