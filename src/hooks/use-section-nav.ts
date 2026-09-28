import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

/**
 * Smooth-scrolls to a homepage section (e.g. "#faq") when already on "/",
 * otherwise navigates to "/#faq" so the Landing page can pick it up and
 * scroll after mount.
 */
export function useSectionNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (hash: string) => {
      const id = hash.replace(/^\/?#/, "");
      if (!id) return;

      if (location.pathname !== "/") {
        navigate(`/#${id}`);
        return;
      }

      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [location.pathname, navigate],
  );
}
