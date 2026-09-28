import { Link } from "react-router";
import { Github, Twitter, Youtube } from "lucide-react";
import { Logo } from "@/components/marketplace/Logo";
import { useSectionNav } from "@/hooks/use-section-nav";

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "Marketplace",
    links: [
      { label: "Browse all products", to: "/marketplace" },
      { label: "Categories", to: "/#categories" },
      { label: "Featured picks", to: "/#featured" },
      { label: "How it works", to: "/#how-it-works" },
    ],
  },
  {
    title: "Sellers",
    links: [
      { label: "Seller Center", to: "/#seller-cta" },
      { label: "Become a seller", to: "/auth" },
      { label: "Verification & KYC", to: "/#faq" },
      { label: "Payouts", to: "/#faq" },
    ],
  },
  {
    title: "Company & legal",
    links: [
      { label: "About AccSmart", to: "/#why" },
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
            <p className="mt-4 max-w-64 text-sm leading-relaxed text-muted-foreground">
              Smart Marketplace for Digital Products — verified sellers, secure
              checkout and buyer protection on every order.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {[
                { icon: Twitter, label: "AccSmart on X" },
                { icon: Github, label: "AccSmart on GitHub" },
                { icon: Youtube, label: "AccSmart on YouTube" },
              ].map(({ icon: Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="clay-inset flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon className="size-4" />
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

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border/70 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>
            © {new Date().getFullYear()} AccSmart. Demo marketplace — all
            products, sellers and reviews are fictional.
          </p>
          <p>Made with clay, gradients and good intentions.</p>
        </div>
      </div>
    </footer>
  );
}
