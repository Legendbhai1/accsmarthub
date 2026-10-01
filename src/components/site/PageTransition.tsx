import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router";

/**
 * Route-level slide/fade transition.
 *
 * Keying the wrapper on `pathname` remounts it on every navigation, which
 * replays the enter animation. There is deliberately no exit animation:
 * React Router's <Routes> reads location from context, so during an exit
 * phase it would already render the *next* page inside the outgoing wrapper.
 * Enter-only keeps the two in sync without that footgun.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={location.pathname}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0.15 : 0.34,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}