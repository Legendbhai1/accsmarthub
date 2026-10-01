import { Link } from "react-router";
import { Logo } from "@/components/site/Logo";
import { BrandMark } from "@/components/site/BrandMark";

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "Marketplace",
    links: [
      { label: "Browse listings", to: "/marketplace" },
      { label: "Instagram accounts", to: "/marketplace?category=instagram" },
      { label: "YouTube channels", to: "/marketplace?category=youtube" },
      { label: "TikTok accounts", to: "/marketplace?category=tiktok" },
    ],
  },
  {
    title: "Sell",
    links: [
      { label: "Become a seller", to: "/auth?mode=register" },
      { label: "Seller dashboard", to: "/seller" },
      { label: "Fees & payouts", to: "/faq" },
      { label: "Verification", to: "/trust" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Trust & safety", to: "/trust" },
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
              A professional marketplace for buying and selling social media
              accounts — verified sellers, escrow-protected transfers and
              responsive support on every order.
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
                  className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
            © {new Date().getFullYear()} AccsMartHub. Demo marketplace — all
            listings, sellers and reviews are fictional.
          </p>
        </div>
      </div>
    </footer>
  );
}
