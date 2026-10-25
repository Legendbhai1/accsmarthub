import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import {
  Bell,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Sun,
  User,
  UserPlus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/Logo";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { roleHome } from "@/components/site/guards";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Home", to: "/" },
  { label: "Marketplace", to: "/marketplace" },
  { label: "Categories", to: "/marketplace/categories" },
  { label: "Disputes", to: "/disputes" },
  { label: "Trust & Safety", to: "/trust" },
  { label: "FAQ", to: "/faq" },
];

export function SiteHeader() {
  const { user, signOut } = useSession();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  // The header is the only sign-in affordance now that it is the only header,
  // so its auth links have to preserve where the shopper was. This used to be
  // the marketplace header's job — it hardcoded `returnTo=/marketplace` — but
  // that header is gone and the shell is on every page. `/auth` is left bare so
  // the auth page's own default still applies there.
  const authTo =
    location.pathname === "/auth" || location.pathname === "/"
      ? "/auth"
      : `/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`;

  const canSell =
    user?.role === "seller" ||
    user?.role === "admin" ||
    user?.sellerStatus === "approved";

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/marketplace?q=${encodeURIComponent(q)}` : "/marketplace");
    setQuery("");
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40">
      {/* The promo strip. Every shopping site carries one — a single line of
          offer text on the brand ramp — and its absence is a large part of why
          the header read as a documentation site rather than a storefront. It
          is `hidden sm:block` because at 360px the header row is already at its
          width budget (see the note on the search field below); on a phone the
          same message lives in the footer. */}
      <div className="brand-gradient-animated hidden text-primary-foreground sm:block">
        <div className="mx-auto flex h-9 w-full max-w-7xl items-center justify-center gap-2 px-4 text-[12px] font-medium tracking-tight sm:px-6">
          <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Every listing is admin-reviewed · your payment is held in-platform
            until you confirm
          </span>
        </div>
      </div>
      <div className="relative border-b border-border/70 bg-card/85 backdrop-blur-xl">
        {/* A hairline of the brand ramp along the top edge of the header. */}
        <span
          aria-hidden="true"
          className="brand-rule absolute inset-x-0 top-0 h-0.5 opacity-90"
        />
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo />

          {/* The primary nav needs 500px on its own. Below `xl` there is not
              room for it beside the wordmark, the search field and the auth
              buttons — at 1024px the row overflowed its container by 205px,
              which put a horizontal scrollbar on every page. The hamburger
              below carries the same links, so nothing becomes unreachable. */}
          <nav aria-label="Primary" className="ml-4 hidden items-center xl:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "group relative rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground",
                    isActive && "font-semibold text-primary",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {link.label}
                    {/* The active indicator is the brand ramp rather than a
                        solid block, so the nav reads as the brand without a
                        heavy fill behind every active label. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "brand-rule absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-opacity duration-200",
                        isActive ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <form onSubmit={submitSearch} role="search" className="ml-auto hidden min-w-0 md:block">
            <label htmlFor="site-search" className="sr-only">
              Search listings
            </label>
            <div className="group relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <input
                id="site-search"
                type="search"
                placeholder="Search accounts, niches, platforms…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="inset-well h-10 w-40 rounded-lg pl-9 pr-3 text-sm outline-none transition-all duration-200 placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card focus:ring-2 focus:ring-ring/25 sm:w-56"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2 md:ml-2">
            {/* The person icon. The public header had no profile control at
                all, so the one-tap route to the account a shopper reaches for
                on a phone simply was not there — reaching the profile meant
                opening the account dropdown. Signed-in shoppers land on their
                profile; signed-out visitors are sent to sign in first. This
                mirrors the marketplace header and the dashboard shell, which
                resolve the same destination. */}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground hover:text-foreground"
              asChild
            >
              <Link
                to={user ? "/account/profile" : authTo}
                aria-label={user ? "Your profile" : "Sign in"}
                title={user ? "Your profile" : "Sign in"}
              >
                <User className="size-5" aria-hidden="true" />
              </Link>
            </Button>

            {user && (
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-full"
                aria-label="Notifications"
                onClick={() => navigate("/account/notifications")}
              >
                <Bell className="size-4.5" />
                <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive ring-2 ring-card" />
                <span
                  aria-hidden="true"
                  className="absolute right-2 top-2 size-2 animate-pulse-glow rounded-full bg-destructive"
                />
              </Button>
            )}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="rounded-lg"
                    aria-label="Account menu"
                    aria-haspopup="menu"
                  >
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {user.name.charAt(0)}
                    </span>
                    <span className="hidden max-w-24 truncate sm:inline">{user.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs">
                    {user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate(roleHome[user.role])}>
                    <LayoutDashboard className="size-4" />
                    {user.role === "admin"
                      ? "Admin panel"
                      : user.role === "seller"
                        ? "Seller dashboard"
                        : "My account"}
                  </DropdownMenuItem>
                  {/* Cross-role shortcuts: every account can reach both sides.
                      The studio is open to everyone now — creating a listing
                      does not wait on a store profile, so this link no longer
                      branches to the store application. */}
                  {user.role === "buyer" && (
                    <DropdownMenuItem onClick={() => navigate("/seller")}>
                      <Store className="size-4" />
                      {canSell ? "Seller dashboard" : "Start selling"}
                    </DropdownMenuItem>
                  )}
                  {user.role !== "buyer" && (
                    <DropdownMenuItem onClick={() => navigate("/account")}>
                      <ShoppingBag className="size-4" />
                      Buyer account
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => navigate("/account/profile")}>
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="size-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" className="hidden sm:inline-flex" asChild>
                  <Link to={authTo}>
                    <LogIn className="size-4" />
                    Log in
                  </Link>
                </Button>
                <Button className="hidden sm:inline-flex" asChild>
                  <Link to={`${authTo}${authTo.includes("?") ? "&" : "?"}mode=register`}>
                    <UserPlus className="size-4" />
                    <span className="hidden sm:inline">Create account</span>
                    <span className="sm:hidden">Sign up</span>
                  </Link>
                </Button>
              </>
            )}

            {/* Three-line menu. On mobile its first two entries are the two
                quick actions — become a seller, and switch between dark and
                light mode — followed by the rest of the site navigation.
                It must appear exactly where the desktop nav does not: the nav
                is `xl:flex`, so this is `xl:hidden`. While the nav was
                `lg:flex` this was `lg:hidden`; moving one without the other
                would leave 1024-1279px with no navigation at all. */}
            <Button
              variant="outline"
              size="icon"
              className="xl:hidden"
              aria-label="Open menu"
              aria-haspopup="menu"
              onClick={() => setMobileOpen(true)}
            >
              <span aria-hidden="true" className="flex flex-col items-center gap-[3px]">
                <span className="block h-[1.5px] w-4 rounded-full bg-current" />
                <span className="block h-[1.5px] w-4 rounded-full bg-current" />
                <span className="block h-[1.5px] w-4 rounded-full bg-current" />
              </span>
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-80 border-border/70 px-0">
          <SheetHeader className="px-5 pb-2 pt-5">
            <SheetTitle>
              <Logo />
            </SheetTitle>
          </SheetHeader>
          <nav aria-label="Mobile" className="flex flex-col gap-1 px-3">
            {/* The two quick options this menu is opened for. */}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                navigate("/seller");
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <Store className="size-4" />
              {canSell && user?.role !== "buyer"
                ? "Seller dashboard"
                : "Start selling"}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            </button>
            <div className="my-1.5 border-t border-border" />

            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent"
              >
                {link.label}
              </Link>
            ))}
            {user && (
              <>
                <Link
                  to={roleHome[user.role]}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent"
                >
                  <LayoutDashboard className="mr-2 inline size-4" />
                  Dashboard
                </Link>
                {/* Cross-role shortcut in the hamburger menu. */}
                {user.role !== "buyer" && (
                  <Link
                    to="/account"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent"
                  >
                    <ShoppingBag className="mr-2 inline size-4" />
                    Buyer account
                  </Link>
                )}
              </>
            )}
          </nav>
          <div className="mt-auto flex flex-col gap-2 p-4">
            <form onSubmit={submitSearch} role="search">
              <label htmlFor="mobile-search" className="sr-only">
                Search listings
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="mobile-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search listings…"
                  className="inset-well h-10 w-full rounded-lg pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </form>
            {!user && (
              <Button variant="outline" asChild>
                <Link to={authTo} onClick={() => setMobileOpen(false)}>
                  <ShoppingCart className="size-4" />
                  Sign in to buy or sell
                </Link>
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
