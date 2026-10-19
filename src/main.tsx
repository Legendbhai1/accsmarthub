import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import router from "./App";
import { SessionProvider } from "@/lib/session";
import { ThemeProvider, bootstrapTheme } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

// Applies the stored / OS theme before React mounts. `ThemeProvider` reads the
// resulting class during its state initialiser, so the first render is already
// correct and nothing flips after mount.
bootstrapTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <SessionProvider>
        <RouterProvider router={router} />
        {/* Mounted once at the root: the toast calls made throughout the app
            render nothing at all without it. Inside ThemeProvider so toasts
            follow the selected appearance. */}
        <Toaster />
      </SessionProvider>
    </ThemeProvider>
  </StrictMode>,
);
