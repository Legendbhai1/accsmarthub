/**
 * Light / dark appearance.
 *
 * The theme is a class on <html> (`.dark`) so Tailwind's
 * `@custom-variant dark (&:is(.dark *))` picks it up, and the matching CSS
 * variable set lives in `index.css`. The chosen value is persisted in
 * localStorage and mirrored on `document.documentElement.style.colorScheme`
 * so native controls (scrollbars, date pickers) follow too.
 *
 * FOUC: `index.html` runs a tiny inline script that applies the stored class
 * before first paint. React therefore only ever has to *change* the class,
 * never add it for the first time — which is why the state below is
 * initialised from the DOM rather than set in an effect.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "accsmarthub.theme";

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private mode / storage disabled — fall back to the DOM class below.
  }
  return null;
}

/** Pushes the theme onto <html>. Safe to call before React mounts. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Read the class the inline bootstrap script already applied. Reading it in
  // the initialiser (rather than setting state from an effect) means the very
  // first render is already correct and the UI never flips after mount.
  const [theme, setThemeState] = useState<Theme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Persistence is best-effort; the in-memory theme still works.
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    [],
  );

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Follows the OS preference until the visitor picks a side.
 * Called from `main.tsx` once, before the first render.
 */
export function bootstrapTheme() {
  const stored = readStoredTheme();
  if (stored) {
    applyTheme(stored);
    return;
  }
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}
