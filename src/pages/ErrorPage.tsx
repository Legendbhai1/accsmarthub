import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import { ArrowLeft, RotateCw, TriangleAlert } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/Logo";

/**
 * The route-level error boundary.
 *
 * Without this, React Router renders its built-in screen, which prints a raw
 * stack trace to every visitor. This replaces that with something a buyer or
 * seller can act on.
 *
 * The real error is never hidden: in development the message, status and stack
 * are printed below the friendly copy, so a crash during local work is still
 * fully diagnosable. In a production build only the safe, non-technical copy
 * is shown — an error message can name internal tables and columns, so it is
 * not something to hand to an end user.
 */
export default function ErrorPage() {
  const error = useRouteError();

  const isResponse = isRouteErrorResponse(error);
  const status = isResponse ? error.status : null;
  const heading =
    status === 404
      ? "Page not found"
      : status === 401 || status === 403
        ? "You do not have access to this page"
        : "Something went wrong";

  const message = (() => {
    if (isResponse) return error.statusText || `Request failed with status ${status}.`;
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "An unexpected error stopped this page from loading.";
  })();

  const stack = error instanceof Error ? error.stack : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex min-h-screen flex-col"
    >
      <div className="px-4 py-5 sm:px-6">
        <Logo />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-24 text-center md:pb-0">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10">
          <TriangleAlert className="size-5 text-destructive" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">{heading}</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {status === 404
            ? "The page you're looking for doesn't exist or may have been moved."
            : "This page could not be displayed. Reloading often clears it; if it keeps happening, let us know so we can look into it."}
        </p>

        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
          <Button
            type="button"
            className="rounded-xl"
            onClick={() => window.location.reload()}
          >
            <RotateCw className="size-4" /> Reload page
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" /> Back to marketplace
            </Link>
          </Button>
        </div>

        {import.meta.env.DEV && (
          <details className="mt-8 w-full max-w-2xl text-left">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Error details (development only)
            </summary>
            <pre className="mt-3 max-h-80 overflow-auto rounded-xl border border-border/70 bg-muted/40 p-4 text-left text-xs leading-relaxed whitespace-pre-wrap">
              {message}
              {stack ? `\n\n${stack}` : ""}
            </pre>
          </details>
        )}
      </div>
    </motion.div>
  );
}
