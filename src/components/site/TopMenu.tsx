import { useNavigate } from "react-router";
import { Moon, Store, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The three-line menu at the top of the app.
 *
 * Two options only, as specified: become a seller, and switch between dark
 * and light appearance. It is rendered at the top of every shell (public site
 * header, marketplace app header, dashboards) so the two actions are always
 * one tap away regardless of where you are.
 */
export function TopMenu({
  /** `onDark` is for surfaces that stay near-black in both themes. */
  className,
  align = "end",
}: {
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const navigate = useNavigate();
  const { user } = useSession();
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";
  const canSell =
    user?.role === "seller" ||
    user?.role === "admin" ||
    user?.sellerStatus === "approved";

  const goToSeller = () =>
    navigate(canSell && user?.role !== "buyer" ? "/seller" : "/seller/apply");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          aria-haspopup="menu"
          className={cn(
            "flex size-10 items-center justify-center rounded-full border border-border/70 bg-card/70 text-foreground backdrop-blur-xl transition-colors hover:border-amber-500/40 hover:bg-amber-400/10",
            className,
          )}
        >
          {/* Three-line hamburger, drawn explicitly so the icon reads the same
              on every platform as the system glyph does. */}
          <span aria-hidden="true" className="flex flex-col items-center gap-[3px]">
            <span className="block h-[1.5px] w-4 rounded-full bg-current" />
            <span className="block h-[1.5px] w-4 rounded-full bg-current" />
            <span className="block h-[1.5px] w-4 rounded-full bg-current" />
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Quick menu
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={goToSeller}>
          <Store className="size-4" />
          {canSell && user?.role !== "buyer" ? "Seller dashboard" : "Become a seller"}
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={(event) => {
            // Radix closes the menu on select; the appearance change should
            // feel like a switch staying put, so keep it open.
            event.preventDefault();
            toggleTheme();
          }}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {isDark ? "Switch to light mode" : "Switch to dark mode"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
