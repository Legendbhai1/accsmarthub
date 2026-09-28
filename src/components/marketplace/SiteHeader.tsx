import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  LogIn,
  Menu,
  Search,
  ShoppingCart,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Logo } from "@/components/marketplace/Logo";
import { CartDrawer } from "@/components/marketplace/CartDrawer";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/lib/cart";
import { useSectionNav } from "@/hooks/use-section-nav";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Marketplace", to: "/marketplace" },
  { label: "Categories", to: "/#categories" },
  { label: "How It Works", to: "/#how-it-works" },
  { label: "FAQ", to: "/#faq" },
];

export function SiteHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { count, setOpen } = useCart();
  const goToSection = useSectionNav();
  const [query, setQuery] = useState("");

  // The mobile menu is bound to the route it was opened on, so any
  // navigation (path or query change) closes it without an effect.
  const routeKey = `${location.pathname}${location.search}`;
  const [menuRoute, setMenuRoute] = useState<string | null>(null);
  const mobileOpen = menuRoute === routeKey;
  const setMobileOpen = (open: boolean) => setMenuRoute(open ? routeKey : null);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/marketplace?q=${encodeURIComponent(q)}` : "/marketplace");
    setQuery("");
  };

  const isActive = (to: string) =>
    to === "/marketplace" && location.pathname === to;

  const handleSectionClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    hash: string,
  ) => {
    e.preventDefault();
    setMobileOpen(false);
    goToSection(hash);
  };

  return (
    <header className="sticky top-0 z-40">
      <div className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo />

          <nav
            aria-label="Primary"
            className="ml-4 hidden items-center gap-1 lg:flex"
          >
            {NAV_LINKS.map((link) =>
              link.to.startsWith("/#") ? (
                <a
                  key={link.label}
                  href={link.to}
                  onClick={(e) => handleSectionClick(e, link.to)}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    isActive(link.to) && "bg-accent text-foreground",
                  )}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  to={link.to}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    isActive(link.to) && "bg-accent text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>

          <form
            onSubmit={submitSearch}
            role="search"
            className="ml-auto hidden md:block"
          >
            <label htmlFor="site-search" className="sr-only">
              Search products
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="site-search"
                type="search"
                placeholder="Search products…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="clay-inset h-10 w-44 rounded-2xl pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:w-56 focus:ring-2 focus:ring-ring/60 lg:w-52 lg:focus:w-64"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2 md:ml-3">
            <Button
              variant="clay"
              size="icon"
              className="relative rounded-2xl"
              aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
              onClick={() => setOpen(true)}
            >
              <ShoppingCart className="size-4.5" />
              {count > 0 && (
                <Badge className="absolute -right-1.5 -top-1.5 size-5 justify-center rounded-full p-0 text-[10px] font-bold">
                  {count > 9 ? "9+" : count}
                </Badge>
              )}
            </Button>

            {isAuthenticated ? (
              <Button variant="clay" size="icon" className="rounded-2xl" asChild>
                <Link to="/dashboard" aria-label="Open dashboard">
                  <LayoutDashboard className="size-4.5" />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" className="rounded-xl" asChild>
                  <Link to="/auth">Log in</Link>
                </Button>
                <Button variant="clay" className="clay-btn rounded-xl" asChild>
                  <Link to="/auth">
                    <UserPlus className="size-4" />
                    <span className="hidden sm:inline">Create Account</span>
                    <span className="sm:hidden">Sign up</span>
                  </Link>
                </Button>
                <Button
                  variant="clay"
                  size="icon"
                  className="rounded-2xl lg:hidden"
                  aria-label="Open menu"
                  aria-expanded={mobileOpen}
                  onClick={() => setMobileOpen(true)}
                >
                  <Menu className="size-4.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cart drawer (mounted once, shared by every marketplace page) */}
      <CartDrawer />

      {/* Mobile menu sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-80 gap-0 border-border/70 px-0">
          <SheetHeader className="px-5 pb-2 pt-5">
            <SheetTitle className="flex items-center">
              <Logo />
            </SheetTitle>
          </SheetHeader>
          <nav aria-label="Mobile" className="flex flex-col gap-1 px-3">
            {NAV_LINKS.map((link) =>
              link.to.startsWith("/#") ? (
                <a
                  key={link.label}
                  href={link.to}
                  onClick={(e) => handleSectionClick(e, link.to)}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  to={link.to}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent"
                >
                  {link.label}
                </Link>
              ),
            )}
            {isAuthenticated && (
              <Link
                to="/dashboard"
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent"
              >
                <LayoutDashboard className="mr-2 inline size-4" />
                Dashboard
              </Link>
            )}
          </nav>
          <div className="mt-auto flex flex-col gap-2 p-4">
            <form onSubmit={submitSearch} role="search">
              <label htmlFor="mobile-search" className="sr-only">
                Search products
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="mobile-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search products…"
                  className="clay-inset h-10 w-full rounded-2xl pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/60"
                />
              </div>
            </form>
            {isAuthenticated ? (
              <Button variant="clay" className="rounded-xl" asChild>
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            ) : (
              <Button variant="outline" className="rounded-xl" asChild>
                <Link to="/auth">
                  <LogIn className="size-4" /> Log in
                </Link>
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
