/**
 * @file A tab that reconnects to a restarted server refetches everything (spec 7.3), and one that
 * meets event shapes from another version refetches instead of patching (17.18, practice 8).
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

const now = "2026-10-30T09:00:00+00:00";
// The run this tab last heard from is module state, so every test starts from "first-run".

/** Mounts the subscription and returns the client's refetch spy. */
function subscribe() {
  vi.stubGlobal("EventSource", FakeEventSource);
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <Subscriber />
    </QueryClientProvider>,
  );
  return { client, invalidate };
}

test("events of another version are refetched, not patched into the cache", () => {
  const { client, invalidate } = subscribe();
  const live = [{ id: "T-1", tokens_per_second: 10, state: "generating" }];
  client.setQueryData(["live"], live);
  const progress = { task_id: "T-1", tokens_per_second: 99, state: "generating" };

  FakeEventSource.latest.deliver("hello", 1, { now, boot: "first-run", events_version: 2 });
  FakeEventSource.latest.deliver("task.progress", 2, progress);

  expect(client.getQueryData(["live"])).toEqual(live);
  expect(invalidate).toHaveBeenCalledTimes(1);

  FakeEventSource.latest.deliver("hello", 2, { now, boot: "first-run", events_version: 1 });
  FakeEventSource.latest.deliver("task.progress", 3, progress);

  expect(client.getQueryData(["live"])).toEqual([{ ...live[0], tokens_per_second: 99 }]);
});

test("a hello from a different run of the server refetches everything", () => {
  const { invalidate } = subscribe();

  FakeEventSource.latest.deliver("hello", 30, { now, boot: "first-run", events_version: 1 });
  FakeEventSource.latest.deliver("hello", 31, { now, boot: "first-run", events_version: 1 });
  expect(invalidate).not.toHaveBeenCalled();

  // The restarted server's ids have already passed 31, so only `boot` shows the restart.
  FakeEventSource.latest.deliver("hello", 40, { now, boot: "second-run", events_version: 1 });
  expect(invalidate).toHaveBeenCalledWith();
});
