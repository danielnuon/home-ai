/**
 * @file The app root: data cache, motion settings, the passkey and toast providers, the live event
 * stream, and the router.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { useLiveEvents } from "./api/events";
import { StepUpProvider } from "./components/StepUp";
import { ToastProvider } from "./components/Toasts";
import NotFound from "./pages/NotFound";
import { ROUTES } from "./routes";
import { AppShell } from "./shell/AppShell";

/**
 * Data is pushed, not polled (spec 7.13), so cached data stays fresh until an event says
 * otherwise; refetching on focus would only add requests.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: 1 },
    },
  });
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      ...ROUTES.map(({ path, page: Page }) => ({ path, element: <Page /> })),
      { path: "*", element: <NotFound /> },
    ],
  },
]);

/** Subscribes to live events inside the query provider. */
function LiveEvents() {
  useLiveEvents();
  return null;
}

/** The whole app. `client` is injectable for tests. */
export function App({ client = makeQueryClient() }: { client?: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <StepUpProvider>
            <LiveEvents />
            <RouterProvider router={router} />
          </StepUpProvider>
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
