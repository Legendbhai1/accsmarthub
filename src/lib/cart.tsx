import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

export type CartItem = {
  slug: string;
  name: string;
  price: number;
  quantity: number;
  hue: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (slug: string, quantity: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
  has: (slug: string) => boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "accsmart.cart.v1";

function readStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStorage);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage unavailable — cart stays in memory for the session
    }
  }, [items]);

  const value = useMemo<CartContextValue>(() => {
    const add = (item: Omit<CartItem, "quantity">, quantity = 1) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.slug === item.slug);
        if (existing) {
          return prev.map((i) =>
            i.slug === item.slug
              ? { ...i, quantity: Math.min(99, i.quantity + quantity) }
              : i,
          );
        }
        return [...prev, { ...item, quantity }];
      });
      toast.success(`${item.name} added to cart`);
    };

    const updateQuantity = (slug: string, quantity: number) => {
      setItems((prev) =>
        quantity <= 0
          ? prev.filter((i) => i.slug !== slug)
          : prev.map((i) =>
              i.slug === slug ? { ...i, quantity: Math.min(99, quantity) } : i,
            ),
      );
    };

    const remove = (slug: string) => {
      setItems((prev) => prev.filter((i) => i.slug !== slug));
      toast("Removed from cart");
    };

    const clear = () => setItems([]);

    const has = (slug: string) => items.some((i) => i.slug === slug);

    return {
      items,
      count: items.reduce((sum, i) => sum + i.quantity, 0),
      total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      add,
      updateQuantity,
      remove,
      clear,
      has,
      open,
      setOpen,
    };
  }, [items, open]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}
