/**
 * @file A tab that reconnects to a restarted server refetches everything (spec 7.3).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useLiveEvents } from "./events";

/** Stands in for the browser's EventSource and lets the test deliver events by hand. */
class FakeEventSource {
  static latest: FakeEventSource;
  private readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();

  constructor() {
    FakeEventSource.latest = this;
  }

  addEventListener(kind: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(kind, listener);
  }

  close(): void {
    this.listeners.clear();
  }

  deliver(kind: string, id: number, payload: unknown): void {
    this.listeners.get(kind)?.(
      new MessageEvent(kind, { data: JSON.stringify(payload), lastEventId: String(id) }),
    );
  }
}

function Subscriber() {
  useLiveEvents();
  return null;
}

test("a hello from a different run of the server refetches everything", () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <Subscriber />
    </QueryClientProvider>,
  );
  const now = "2026-10-30T09:00:00+00:00";

  FakeEventSource.latest.deliver("hello", 30, { now, boot: "first-run" });
  FakeEventSource.latest.deliver("hello", 31, { now, boot: "first-run" });
  expect(invalidate).not.toHaveBeenCalled();

  // The restarted server's ids have already passed 31, so only `boot` shows the restart.
  FakeEventSource.latest.deliver("hello", 40, { now, boot: "second-run" });
  expect(invalidate).toHaveBeenCalledWith();
});
