import { motion } from "framer-motion";
import {
  BadgeCheck,
  Gamepad2,
  GraduationCap,
  KeyRound,
  Palette,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";

/**
 * Abstract claymorphic "digital marketplace" artwork: layered clay tiles,
 * floating product chips and soft glows. Pure CSS/motion — no image assets.
 */
export function HeroVisual() {
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-130"
      aria-hidden="true"
    >
      {/* backdrop glows */}
      <div className="glow-blue absolute left-1/2 top-1/2 size-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute right-0 top-6 size-40 rounded-full bg-secondary/20 blur-3xl" />

      {/* dotted grid backdrop */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(oklch(1 0 0 / 10%) 1px, transparent 1.5px)",
          backgroundSize: "22px 22px",
          maskImage:
            "radial-gradient(closest-side, black 55%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(closest-side, black 55%, transparent 100%)",
        }}
      />

      {/* central clay plate */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="clay absolute left-1/2 top-1/2 flex size-56 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2.5rem] sm:size-64"
      >
        <div
          className="flex size-36 items-center justify-center rounded-[1.9rem] sm:size-40"
          style={{
            background:
              "linear-gradient(145deg, oklch(0.72 0.15 229 / 90%), oklch(0.63 0.16 293 / 90%))",
            boxShadow:
              "inset 0 3px 6px oklch(1 0 0 / 40%), inset 0 -5px 10px oklch(0.2 0.06 280 / 45%), 0 14px 30px -8px oklch(0.67 0.15 260 / 65%)",
          }}
        >
          <ShoppingBag className="size-16 text-white drop-shadow" strokeWidth={1.6} />
        </div>
        {/* orbit ring */}
        <div className="pointer-events-none absolute inset-6 rounded-[2rem] border border-border/70" />
      </motion.div>

      {/* floating chips */}
      {[
        { icon: KeyRound, label: "Licenses", hue: 222, pos: "left-[2%] top-[10%]", delay: 0.15 },
        { icon: Gamepad2, label: "Games", hue: 285, pos: "right-[0%] top-[22%]", delay: 0.25 },
        { icon: Palette, label: "Design", hue: 310, pos: "left-[6%] bottom-[18%]", delay: 0.35 },
        { icon: GraduationCap, label: "Courses", hue: 168, pos: "right-[8%] bottom-[8%]", delay: 0.45 },
      ].map(({ icon: Icon, label, hue, pos, delay }) => {
        return (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay, ease: "easeOut" }}
            className={`clay absolute flex items-center gap-2.5 rounded-2xl p-3 pr-4 ${pos}`}
          >
            <span
              className="flex size-9 items-center justify-center rounded-xl"
              style={{
                background: `linear-gradient(145deg, oklch(0.75 0.12 ${hue} / 90%), oklch(0.5 0.15 ${hue + 25} / 92%))`,
                boxShadow:
                  "inset 0 2px 3px oklch(1 0 0 / 35%), inset 0 -2px 5px oklch(0.2 0.06 260 / 40%)",
              }}
            >
              <Icon className="size-4.5 text-white" strokeWidth={2} />
            </span>
            <span className="text-sm font-semibold">{label}</span>
          </motion.div>
        );
      })}

      {/* verified badge chip */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.55 }}
        className="clay absolute bottom-[30%] left-[16%] flex items-center gap-2 rounded-full py-2 pl-3 pr-4"
      >
        <BadgeCheck className="size-4 text-primary" />
        <span className="text-xs font-semibold">Verified sellers</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.65 }}
        className="clay absolute right-[14%] top-[6%] flex items-center gap-2 rounded-full py-2 pl-3 pr-4"
      >
        <ShieldCheck className="size-4 text-emerald-400" />
        <span className="text-xs font-semibold">Buyer protection</span>
      </motion.div>
    </div>
  );
}
