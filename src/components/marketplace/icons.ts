import {
  Facebook,
  Gamepad2,
  Instagram,
  Linkedin,
  MessagesSquare,
  Music2,
  Package,
  Pin,
  ShoppingBag,
  Twitch,
  Twitter,
  Youtube,
  type LucideIcon,
} from "lucide-react";

/**
 * Explicit icon registry for demo catalog artwork. Keeps lucide tree-shakeable
 * instead of pulling the whole icon set in with a namespace import.
 */
export const catalogIcons: Record<string, LucideIcon> = {
  Facebook,
  Gamepad2,
  Instagram,
  Linkedin,
  MessagesSquare,
  Music2,
  Package,
  Pin,
  ShoppingBag,
  Twitch,
  Twitter,
  Youtube,
};

export function getCatalogIcon(name: string): LucideIcon {
  return catalogIcons[name] ?? Package;
}
