import { Link } from "react-router";
import { Logo } from "@/components/site/Logo";
import { BrandMark } from "@/components/site/BrandMark";
import { TELEGRAM_CHANNEL } from "@/lib/contact";

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
    <footer className="relative mt-24 border-t border-border/70 bg-muted/30">
      {/* The brand ramp as a hairline across the top of the footer, so the page
          closes on the same colour it opened with. */}
      <span
        aria-hidden="true"
        className="brand-rule absolute inset-x-0 top-0 h-px"
      />
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
                { brand: "x", label: "AccsMartHub on X", href: "https://x.com/accsmarthub" },
                { brand: "youtube", label: "AccsMartHub on YouTube", href: "https://youtube.com/@accsmarthub" },
                { brand: "telegram", label: TELEGRAM_CHANNEL.label, href: TELEGRAM_CHANNEL.url },
              ].map(({ brand, label, href }) => (
                <a
                  key={brand}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary hover:shadow-md"
                >
                  <BrandMark brand={brand} className="size-4" />
                </a>
              ))}
            </div>
            <p className="mt-4 text-sm">
              <a
                href={TELEGRAM_CHANNEL.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Join our Telegram channel
              </a>{" "}
              <span className="text-muted-foreground">
                for updates and announcements.
              </span>
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="font-display text-sm font-bold tracking-tight">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="group inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      <span className="mr-0 h-px w-0 bg-primary transition-all duration-200 group-hover:mr-1.5 group-hover:w-3" />
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
