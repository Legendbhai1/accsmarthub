import { Link } from "react-router";
import { Logo } from "@/components/site/Logo";
import { BrandMark } from "@/components/site/BrandMark";

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "Marketplace",
    links: [
      { label: "Browse listings", to: "/marketplace" },
      { label: "All categories", to: "/marketplace/categories" },
      { label: "Instagram accounts", to: "/marketplace?category=instagram" },
      { label: "YouTube channels", to: "/marketplace?category=youtube" },
      { label: "TikTok accounts", to: "/marketplace?category=tiktok" },
    ],
  },
  {
    title: "Sell",
    links: [
      { label: "Start selling", to: "/seller/listings?new=1" },
      { label: "Seller dashboard", to: "/seller" },
      { label: "Fees & payouts", to: "/faq" },
      { label: "Verification", to: "/trust" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Trust & safety", to: "/trust" },
      { label: "Disputes & payment protection", to: "/disputes" },
      { label: "FAQ", to: "/faq" },
      { label: "Support", to: "/account/support" },
      { label: "Terms & privacy", to: "/faq" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/70">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-72 text-sm leading-relaxed text-muted-foreground">
              A marketplace for buying and selling social media accounts —
              every listing moderated before it goes live, with payments held
              in-platform until the buyer confirms.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {[
                { brand: "x", label: "AccsMartHub on X" },
                { brand: "youtube", label: "AccsMartHub on YouTube" },
                { brand: "telegram", label: "AccsMartHub on Telegram" },
              ].map(({ brand, label }) => (
                <a
                  key={brand}
                  href="#"
                  aria-label={label}
                  className="flex size-10 items-center justify-center rounded-full border border-border/70 bg-card/60 text-muted-foreground backdrop-blur-xl transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                >
                  <BrandMark brand={brand} className="size-4" />
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="text-sm font-semibold">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t border-border/70 pt-6 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} AccsMartHub. Orders, balances and
            listings are real, and payments are held in-platform until the
            buyer confirms. Every listing in the marketplace was reviewed and
            approved by an admin before it went live.
          </p>
        </div>
      </div>
    </footer>
  );
}
