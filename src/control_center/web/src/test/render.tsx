/**
 * @file Renders a page the way the app does, against a fake server.
 *
 * `fakeServer` answers `fetch` from a table of handlers keyed by "METHOD /path" and records every
 * request, so a test can assert what the page sent, including the CSRF and step-up headers.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { StepUpProvider } from "../components/StepUp";
import { ToastProvider } from "../components/Toasts";

/** What a handler returns: a JSON body, or a status with a body. */
type Answer = unknown | { status: number; body: unknown };

/** A recorded request. */
export interface SentRequest {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

type Handler = (request: SentRequest) => Answer;

function isStatusAnswer(answer: Answer): answer is { status: number; body: unknown } {
  return typeof answer === "object" && answer !== null && "status" in answer && "body" in answer;
}

/** Replaces `fetch` with the handlers and returns the list of requests made. */
export function fakeServer(handlers: Record<string, Handler>): SentRequest[] {
  const sent: SentRequest[] = [];
  const base: Record<string, Handler> = { "GET /api/session": () => ({ csrf_token: "test-csrf" }) };
  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = url.split("?")[0] ?? url;
    const request: SentRequest = {
      method,
      path,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    sent.push(request);
    const handler = handlers[`${method} ${path}`] ?? base[`${method} ${path}`];
    const answer = handler
      ? handler(request)
      : { status: 404, body: { error: "not_found", reason: "No handler" } };
    const { status, body } = isStatusAnswer(answer) ? answer : { status: 200, body: answer };
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
  return sent;
}

/** Renders `page` inside the providers the app gives every page. */
export function renderPage(page: ReactElement, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <StepUpProvider>
          <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>
        </StepUpProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
