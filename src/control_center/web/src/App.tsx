/**
 * @file The app root: data cache, motion settings, the passkey and toast providers, the live event
 * stream, and the router.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createBrowserRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { useLiveEvents } from "./api/events";
import { StepUpProvider } from "./components/StepUp";
import { ToastProvider } from "./components/Toasts";
import { LazyMotion, MotionConfig, motionFeatures } from "./design/motion";
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

/** Every page inside the shell. The preview mounts the same tree on a memory router. */
export const ROUTE_TREE: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      ...ROUTES.map(({ path, page: Page }) => ({ path, element: <Page /> })),
      { path: "*", element: <NotFound /> },
    ],
  },
];

type AppRouter = ReturnType<typeof createBrowserRouter>;

/** Subscribes to live events inside the query provider. */
function LiveEvents() {
  useLiveEvents();
  return null;
}

/** The whole app. `client` is injectable for tests; `makeRouter` lets the preview use its own. */
export function App({
  client = makeQueryClient(),
  makeRouter = () => createBrowserRouter(ROUTE_TREE),
}: {
  client?: QueryClient;
  makeRouter?: () => AppRouter;
}) {
  const [router] = useState(makeRouter);
  return (
    <QueryClientProvider client={client}>
      <LazyMotion features={motionFeatures} strict>
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <StepUpProvider>
              <LiveEvents />
              <RouterProvider router={router} />
            </StepUpProvider>
          </ToastProvider>
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}
