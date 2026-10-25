import { Outlet, createBrowserRouter } from "react-router";
import ErrorPage from "@/pages/ErrorPage";
import { RouteLoadingScreen } from "@/components/site/RouteLoadingScreen";
import { routes } from "@/routes";

/**
 * The pathless root.
 *
 * It hosts the error boundary, so an error thrown by any route below renders
 * the friendly error page instead of React Router's built-in screen with a raw
 * stack trace, and it mounts the route-transition overlay above every page.
 *
 * The overlay lives here rather than in the page wrappers because those are
 * three different components (`PublicLayout`, `DashShell`, the transactional
 * pages); a single mount above all of them is what makes the transition the
 * same on every navigation, and it means the loader cannot be forgotten when a
 * new shell is added.
 */
function RootLayout() {
  return (
    <>
      <RouteLoadingScreen />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: routes,
  },
]);

export default router;
