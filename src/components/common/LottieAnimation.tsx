import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { LottieHandle } from "lottie-react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * The three bundled LottieFiles animations.
 *
 * `src/assets/animations/README.md` records where each one came from and the
 * licence it is used under. They are bundled rather than fetched from the
 * LottieFiles CDN so they render offline and cannot be swapped underneath us.
 */
export type AnimationName = "add-to-cart" | "shopping-bag" | "order-confirmed";

/**
 * The player is imported lazily, and so is each animation's JSON. A visitor
 * who never adds to the cart never downloads `lottie-react` or any of the
 * three payloads — the largest is 266 KB before compression, which is not
 * something to put in the entry chunk.
 *
 * `LottieSvg` is the middle of the three builds `lottie-react` ships: it drops
 * the canvas and html renderers, which these animations do not use, but keeps
 * the expression engine, which they do.
 */
const LottieSvg = lazy(() =>
  import("lottie-react").then((m) => ({ default: m.LottieSvg })),
);

const loaders: Record<AnimationName, () => Promise<{ default: unknown }>> = {
  "add-to-cart": () => import("@/assets/animations/add-to-cart.json"),
  "shopping-bag": () => import("@/assets/animations/shopping-bag.json"),
  "order-confirmed": () => import("@/assets/animations/order-confirmed.json"),
};

/** The visible text each animation stands in for. Screen readers get this. */
const labels: Record<AnimationName, string> = {
  "add-to-cart": "Added to your cart",
  "shopping-bag": "Your shopping bag",
  "order-confirmed": "Order confirmed",
};

/**
 * One animation, played once.
 *
 * Deliberate choices:
 *
 *   * **It plays once, when the player mounts.** Callers render this component
 *     only after the surrounding flow has succeeded, so a re-render of the
 *     parent cannot restart it — `lottie-react` begins playback when the player
 *     itself mounts, not when its props change. Nothing replays by accident.
 *   * **Reduced motion is honoured.** Under `prefers-reduced-motion` the
 *     animation does not autoplay; the `ready` subscription seeks straight to
 *     the end, so the artwork still shows the outcome without moving.
 *   * **Decorative to the assistive tree, but not silent.** The wrapper carries
 *     `role="img"` and a real label, and the player inside is `aria-hidden`, so
 *     the meaning survives without the animation being announced twice.
 */
export function LottieAnimation({
  name,
  size = 160,
  className,
  label,
}: {
  name: AnimationName;
  /** Rendered edge length in px. The box is square and never overflows. */
  size?: number;
  className?: string;
  /** Overrides the default label when the surrounding copy says it better. */
  label?: string;
}) {
  const reduced = useReducedMotion();
  const [data, setData] = useState<object | null>(null);
  const [failed, setFailed] = useState(false);
  const player = useRef<LottieHandle>(null);

  useEffect(() => {
    let alive = true;
    loaders[name]()
      .then((mod) => {
        if (alive) setData(mod.default as object);
      })
      .catch(() => {
        // A missing or corrupt payload must not take the page down with it.
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [name]);

  return (
    <div
      role="img"
      aria-label={label ?? labels[name]}
      className={cn("mx-auto shrink-0", className)}
      style={{ width: size, height: size, maxWidth: "100%" }}
    >
      {failed ? (
        // Nothing to show, but the label above still carries the meaning.
        <span className="block size-full" aria-hidden="true" />
      ) : (
        <Suspense fallback={<span className="block size-full" aria-hidden="true" />}>
          {data && (
            <LottieSvg
              src={data}
              loop={false}
              autoplay={!reduced}
              lottieRef={player}
              subscriptions={{
                ready: () => {
                  // Hold the finished frame rather than the first one: a
                  // frozen opening frame reads as a broken image.
                  if (reduced) player.current?.seek({ percent: 100 });
                },
              }}
              className="size-full"
              aria-hidden="true"
            />
          )}
        </Suspense>
      )}
    </div>
  );
}
