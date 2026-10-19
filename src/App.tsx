import { createBrowserRouter } from "react-router";
import ErrorPage from "@/pages/ErrorPage";
import { routes } from "@/routes";

/**
 * Pathless root that exists only to host the error boundary, so an error
 * thrown by any route below renders the friendly error page instead of React
 * Router's built-in screen with a raw stack trace. Child paths stay absolute
 * because this route contributes no path segment of its own.
 */
const router = createBrowserRouter([
  {
    errorElement: <ErrorPage />,
    children: routes,
  },
]);

export default router;
