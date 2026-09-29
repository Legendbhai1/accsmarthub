import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import {
  Bell,
  ChevronDown,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
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
import { roleHome } from "@/components/site/guards";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Home", to: "/" },
  { label: "Marketplace", to: "/marketplace" },
  { label: "Trust & Safety", to: "/trust" },
  { label: "FAQ", to: "/faq" },
];

export function SiteHeader() {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

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
      <div className="border-b border-border/70 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo />

          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    isActive && "bg-accent text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <form onSubmit={submitSearch} role="search" className="ml-auto hidden md:block">
            <label htmlFor="site-search" className="sr-only">
              Search listings
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="site-search"
                type="search"
                placeholder="Search accounts, niches, platforms…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="inset-well h-10 w-56 rounded-xl pl-9 pr-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:w-72 focus:ring-2 focus:ring-ring/60"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2 md:ml-2">
            {user && (
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-xl"
                aria-label="Notifications"
                onClick={() => navigate("/account/notifications")}
              >
                <Bell className="size-4.5" />
                <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />
              </Button>
            )}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="rounded-xl">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                      {user.name.charAt(0)}
                    </span>
                    <span className="hidden max-w-24 truncate sm:inline">{user.name}</span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
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
                  {/* Cross-role shortcuts: every account can reach both sides. */}
                  {user.role === "buyer" &&
                    (canSell ? (
                      <DropdownMenuItem onClick={() => navigate("/seller")}>
                        <Store className="size-4" />
                        Seller dashboard
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => navigate("/seller/apply")}>
                        <Store className="size-4" />
                        Become a seller
                      </DropdownMenuItem>
                    ))}
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
                <Button variant="ghost" className="rounded-xl" asChild>
                  <Link to="/auth">
                    <LogIn className="size-4" />
                    Log in
                  </Link>
                </Button>
                <Button className="rounded-xl" asChild>
                  <Link to="/auth?mode=register">
                    <UserPlus className="size-4" />
                    <span className="hidden sm:inline">Create account</span>
                    <span className="sm:hidden">Sign up</span>
                  </Link>
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="icon"
              className="rounded-xl lg:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-4.5" />
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
                {user.role === "buyer" &&
                  (canSell ? (
                    <Link
                      to="/seller"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent"
                    >
                      <Store className="mr-2 inline size-4" />
                      Seller dashboard
                    </Link>
                  ) : (
                    <Link
                      to="/seller/apply"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent"
                    >
                      <Store className="mr-2 inline size-4" />
                      Become a seller
                    </Link>
                  ))}
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
                  className="inset-well h-10 w-full rounded-xl pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/60"
                />
              </div>
            </form>
            {!user && (
              <Button variant="outline" className="rounded-xl" asChild>
                <Link to="/auth" onClick={() => setMobileOpen(false)}>
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
