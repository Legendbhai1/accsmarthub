import { motion } from "framer-motion";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import { BrandIcon } from "@/components/marketplace/BrandIcon";
import { getBrand } from "@/components/marketplace/icons";
import { cn } from "@/lib/utils";

const CHIPS = [
  { brand: "instagram", pos: "left-[2%] top-[12%]", delay: 0.1 },
  { brand: "tiktok", pos: "right-[0%] top-[24%]", delay: 0.18 },
  { brand: "youtube", pos: "left-[6%] bottom-[16%]", delay: 0.26 },
  { brand: "x", pos: "right-[8%] bottom-[10%]", delay: 0.34 },
];

/**
 * Clean hero artwork: a light platform panel with official brand marks,
 * subtle float motion and no expensive blur layers.
 */
export function HeroVisual() {
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-130"
      aria-hidden="true"
    >
      {/* central panel */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="absolute left-1/2 top-1/2 w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border/70 bg-card/60 p-6"
      >
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div>
            <p className="text-xs text-muted-foreground">Portfolio value</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">$128,400</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            +12.4%
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {["instagram", "youtube", "tiktok", "x"].map((brand) => {
            const entry = getBrand(brand);
            return (
              <div key={brand} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
                  <BrandIcon brand={brand} colored className="size-4.5" />
                </span>
                <span className="flex-1 text-sm font-medium">{entry.title}</span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {brand === "instagram"
                    ? "890K"
                    : brand === "youtube"
                      ? "64K"
                      : brand === "tiktok"
                        ? "340K"
                        : "95K"}
                </span>
                <span className="text-sm font-semibold tabular-nums text-emerald-400">
                  {brand === "instagram"
                    ? "$7.4K"
                    : brand === "youtube"
                      ? "$9.8K"
                      : brand === "tiktok"
                        ? "$3.9K"
                        : "$4.2K"}
                </span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* floating platform chips */}
      {CHIPS.map(({ brand, pos, delay }) => (
        <motion.div
          key={brand}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: [0, -6, 0] }}
          transition={{
            opacity: { duration: 0.4, delay },
            y: {
              duration: 4.5,
              repeat: Infinity,
              repeatType: "mirror",
              ease: "easeInOut",
              delay,
            },
            ease: "easeOut",
          }}
          className={cn(
            "absolute flex items-center gap-2 rounded-2xl border border-border/70 bg-card/80 px-3 py-2.5",
            pos,
          )}
        >
          <BrandIcon brand={brand} colored className="size-4.5" />
          <span className="text-xs font-semibold">{getBrand(brand).title}</span>
        </motion.div>
      ))}

      {/* trust chips */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="absolute bottom-[30%] left-[14%] flex items-center gap-2 rounded-full border border-border/70 bg-card/80 py-2 pl-3 pr-4"
      >
        <BadgeCheck className="size-4 text-primary" />
        <span className="text-xs font-semibold">Verified sellers</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="absolute right-[12%] top-[8%] flex items-center gap-2 rounded-full border border-border/70 bg-card/80 py-2 pl-3 pr-4"
      >
        <ShieldCheck className="size-4 text-emerald-400" />
        <span className="text-xs font-semibold">Escrow protected</span>
      </motion.div>
    </div>
  );
}
