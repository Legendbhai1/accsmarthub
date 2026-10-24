import { Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The three-line quick menu.
 *
 * One option: switch between dark and light appearance. The "Start selling" /
 * "Seller dashboard" entry was removed — the seller workspace is reached from
 * the profile menu and the workspace switcher, and duplicating it here put a
 * seller shortcut in front of every visitor on the storefront. Seller routes
 * and functionality are untouched; only this menu changed.
 *
 * It is rendered at the top of every shell (public site header, marketplace
 * app header, dashboards) so appearance is always one tap away.
 */
export function TopMenu({
  /** `onDark` is for surfaces that stay near-black in both themes. */
  className,
  align = "end",
}: {
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          aria-haspopup="menu"
          className={cn(
            "flex size-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground",
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
