import { Link } from "react-router";
import { Logo } from "@/components/marketplace/Logo";
import { BrandIcon } from "@/components/marketplace/BrandIcon";
import { useSectionNav } from "@/hooks/use-section-nav";

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "Marketplace",
    links: [
      { label: "Browse account listings", to: "/marketplace" },
      { label: "Platforms", to: "/#categories" },
      { label: "Featured accounts", to: "/#featured" },
      { label: "How transfers work", to: "/#how-it-works" },
    ],
  },
  {
    title: "Sellers",
    links: [
      { label: "Seller Center", to: "/#seller-cta" },
      { label: "Sell an account", to: "/auth" },
      { label: "Verification & KYC", to: "/#faq" },
      { label: "Payouts", to: "/#faq" },
    ],
  },
  {
    title: "Company & legal",
    links: [
      { label: "About Digital Product Hub", to: "/#why" },
      { label: "Help Center", to: "/#faq" },
      { label: "Terms of Service", to: "/#faq" },
      { label: "Privacy Policy", to: "/#faq" },
      { label: "Refund Policy", to: "/#faq" },
      { label: "Contact", to: "/#faq" },
    ],
  },
];

export function SiteFooter() {
  const goToSection = useSectionNav();

  const handleSectionLink = (
    e: React.MouseEvent<HTMLAnchorElement>,
    hash: string,
  ) => {
    e.preventDefault();
    goToSection(hash);
  };

  return (
    <footer className="mt-24 border-t border-border/70">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-72 text-sm leading-relaxed text-muted-foreground">
              The professional marketplace for buying and selling social media
              accounts — verified sellers, escrow-protected transfers and
              discreet support on every order.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {[
                { brand: "x", label: "Digital Product Hub on X" },
                { brand: "linkedin", label: "Digital Product Hub on LinkedIn" },
                { brand: "youtube", label: "Digital Product Hub on YouTube" },
              ].map(({ brand, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="flex size-9 items-center justify-center rounded-xl border border-border/70 bg-muted/40 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <BrandIcon brand={brand} className="size-4" />
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
                    {link.to.startsWith("/#") ? (
                      <a
                        href={link.to}
                        onClick={(e) => handleSectionLink(e, link.to)}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.to}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t border-border/70 pt-6 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} Digital Product Hub. Demo marketplace —
            all listings, sellers and reviews are fictional.
          </p>
        </div>
      </div>
    </footer>
  );
}
