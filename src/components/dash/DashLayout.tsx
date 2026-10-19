import type { ReactNode } from "react";
import { DashShell } from "@/components/dash/DashShell";
import type { NavSection } from "@/components/dash/navs";

/**
 * The buyer and admin workspaces both render the shared `DashShell`; they
 * differ only in the nav sections they pass in. This wrapper exists so a page
 * keeps a single declarative shell element instead of repeating the rail,
 * header and account block.
 */
export function DashLayout({
  title,
  nav,
  children,
}: {
  title: string;
  nav: NavSection[];
  children?: ReactNode;
}) {
  return (
    <DashShell nav={nav} title={title}>
      {children}
    </DashShell>
  );
}
