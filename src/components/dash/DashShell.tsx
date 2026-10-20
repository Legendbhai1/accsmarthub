import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { ExternalLink, LogOut, Menu, Plus, ShoppingBag, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/Logo";
import { TopMenu } from "@/components/site/TopMenu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  workspaceForPath,
  workspaceLinks,
  type NavItem,
  type NavSection,
  type Workspace,
} from "@/components/dash/navs";
import { useSession } from "@/lib/session";

/** A single rail link. `end` comes from the nav config, not the URL shape. */
function RailLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate?: () => void;
}) {
  const { label, to, icon: Icon, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 font-semibold text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* A brand bar on the active item — the strongest "you are here"
              signal in the rail, and the one place the gradient appears at
              small scale. */}
          {isActive && (
            <span
              aria-hidden="true"
              className="brand-gradient absolute inset-y-1.5 left-0 w-1 rounded-full"
            />
          )}
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

/**
 * The rail contents, shared by the desktop sidebar and the mobile drawer so
 * the two cannot drift apart. This is the *only* navigation the buyer, seller
 * and admin shells render — the public Home / Marketplace / Categories /
 * Account tab bar belongs to `PublicLayout` and is never mounted here.
 */
function RailBody({
  sections,
  secondary,
  onNavigate,
}: {
  sections: NavSection[];
  secondary: Workspace[];
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Workspace" className="flex-1 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.title} className="mb-5 last:mb-0">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {section.title}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <RailLink key={item.label} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}

      {secondary.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Switch workspace
          </p>
          <div className="space-y-0.5">
            {secondary.map(({ label, to, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={onNavigate}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
                <ExternalLink className="ml-auto size-3.5 shrink-0 opacity-50" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

/** Account block pinned to the bottom of the rail. */
function RailFooter({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useSession();
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {(user?.name ?? user?.email ?? "?").charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {user?.name ?? "Signed in"}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {user?.email}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </div>
  );
}

/**
 * The spendable-balance strip, shown only in the buyer workspace.
 *
 * The buyer's wallet is the money they can spend, so it belongs where they
 * buy — not buried one tap deep in `/account/wallet`. It is deliberately
 * absent from the seller studio and the admin console: those workspaces show
 * their own figures (earnings, payouts, the ledger), and repeating the buyer
 * balance there invited sellers to read it as withdrawable earnings.
 */
function BuyerBalanceBar() {
  const { user } = useSession();
  if (!user) return null;

  const held = user.lockedBalance;

  return (
    <div className="border-b border-border bg-card/60">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
        <span className="text-xs text-muted-foreground">Balance</span>
        <span className="text-sm font-semibold tabular-nums">
          {formatPrice(user.balance)}
        </span>
        {held > 0 && (
          <span className="text-xs text-muted-foreground">
            · {formatPrice(held)} held
          </span>
        )}
        <Button
          asChild
          size="sm"
          variant="outline"
          className="ml-auto h-7 rounded-lg px-2.5 text-xs"
        >
          <Link to="/account/wallet">
            <Plus className="size-3.5" />
            Add funds
          </Link>
        </Button>
      </div>
    </div>
  );
}


/**
 * "Switch to …", in the header.
 *
 * The rail already offers the other workspaces, but on a phone the rail is a
 * drawer and on desktop it is at the very bottom of a long sidebar — so the
 * control existed without being discoverable. This is a single, explicit
 * button naming the destination, which is what a user looking to change
 * workspace actually reaches for. A menu was tried first and replaced: a
 * chevron sitting beside the hamburger read as a second, identical menu
 * button, and the destination was hidden behind a tap for no benefit.
 *
 * The destination is the first workspace the account can open that is not the
 * one it is standing in, so the label always matches what the click does.
 */
const SWITCH_TARGET = {
  seller: { label: "Switch to seller", to: "/seller", icon: Store },
  buyer: { label: "Switch to buyer", to: "/account", icon: ShoppingBag },
} as const;

function WorkspaceSwitcher({ links }: { links: Workspace[] }) {
  const target =
    links.find((link) => link.to === "/seller") ? SWITCH_TARGET.seller
    : links.find((link) => link.to === "/account") ? SWITCH_TARGET.buyer
    : null;
  if (!target) return null;

  const { label, to, icon: Icon } = target;
  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="h-9 rounded-lg px-2.5 text-xs"
    >
      {/* The label is hidden on the narrowest screens, where the header has no
          room for it, so the name has to come from `aria-label` — otherwise
          the control is a bare icon with no accessible name. */}
      <Link to={to} aria-label={label}>
        <Icon className="size-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    </Button>
  );
}

/**
 * The one dashboard shell.
 *
 * Buyer, seller and admin all render this, differing only in the nav sections
 * they pass. That is deliberate: previously the seller studio had its own
 * bespoke shell while buyer and admin shared a second one, so the three
 * workspaces had three different headers, three different mobile patterns and
 * — the actual bug — the *public* bottom tab bar mounted inside two of them.
 *
 * Mobile navigation is a drawer behind the header button. There is no bottom
 * bar here at all, so nothing can overlap page content and no public tab can
 * leak in.
 */
export function DashShell({
  nav,
  title,
  subtitle,
  action,
  children,
}: {
  nav: NavSection[];
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const { user, signOut } = useSession();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  // The drawer closes itself on navigation through `onNavigate`, which every
  // rail link calls — an effect watching the path would duplicate that and
  // re-render on every route change.

  // The switcher omits the workspace the user is standing in, so it is derived
  // from the live pathname rather than the role alone.
  const here = workspaceForPath(location.pathname);
  const secondary = workspaceLinks(user?.role ?? "buyer", location.pathname);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <Logo />
        </div>
        <RailBody sections={nav} secondary={secondary} />
        <RailFooter onSignOut={signOut} />
      </aside>

      {/* Mobile drawer — same contents, one source of truth. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-[17rem] gap-0 border-r border-border bg-card p-0 sm:max-w-[17rem]"
        >
          <SheetHeader className="h-16 justify-center border-b border-border p-0 px-4">
            <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
            <Logo />
          </SheetHeader>
          <RailBody
            sections={nav}
            secondary={secondary}
            onNavigate={() => setDrawerOpen(false)}
          />
          <RailFooter onSignOut={signOut} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col lg:pl-64">
        {/* Sticky bar. Blur is kept here because rows really do scroll under
            it; every other surface in the app is opaque. The brand hairline
            along the bottom edge is what ties the three workspaces together
            visually without tinting the bar itself. */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
          <span
            aria-hidden="true"
            className="brand-rule absolute inset-x-0 bottom-0 h-px opacity-60"
          />
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open workspace navigation"
              aria-expanded={drawerOpen}
              className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            >
              <Menu className="size-5" />
            </button>

            {/* The workspace name is visually hidden, not a heading: the
                page's own `h1` sits in the page head below and is the only
                title on screen. Previously the shell rendered an `h1` on
                mobile and the page an `h2` on desktop, so the document had no
                `h1` at all on desktop and two competing titles on mobile.
                Kept in the accessibility tree so a desktop user moving by
                landmark still hears which workspace this is. */}
            <div className="sr-only">
              <p>{title}</p>
              {subtitle && <p>{subtitle}</p>}
            </div>

            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <Logo />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {user?.role && (
                <span className="hidden rounded-md border border-border bg-muted/60 px-2 py-1 text-[11px] font-medium capitalize text-muted-foreground sm:inline-block">
                  {user.role}
                </span>
              )}
              <WorkspaceSwitcher links={secondary} />
              <TopMenu />
            </div>
          </div>
          {here === "buyer" && <BuyerBalanceBar />}
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">
            {/* The one `h1` for the page, at every width, with the optional
                primary action beside it. */}
            <div className="page-head mb-7">
              <div className="min-w-0">
                <h1 className="page-title">{title}</h1>
                {subtitle && <p className="page-sub mt-1.5">{subtitle}</p>}
              </div>
              {action}
            </div>
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}
