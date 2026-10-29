/**
 * @file Staleness is judged on the server's clock, so a device clock that is off does not matter.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { setServerNow, useStaleStatus } from "./stale";

afterEach(() => vi.useRealTimers());

test("a fresh sample stays fresh on a device whose clock runs ahead", () => {
  vi.useFakeTimers({ now: new Date("2026-10-29T12:10:00Z") }); // device is 10 minutes fast
  act(() => setServerNow("2026-10-29T12:00:00Z"));

  const { result } = renderHook(() => useStaleStatus("2026-10-29T11:59:30Z"));

  expect(result.current).toBeNull();
});

test("a sample older than 3 minutes on the server's clock is stale", () => {
  vi.useFakeTimers({ now: new Date("2026-10-29T12:00:00Z") });
  act(() => setServerNow("2026-10-29T12:00:00Z"));

  const { result } = renderHook(() => useStaleStatus("2026-10-29T11:58:00Z"));
  expect(result.current).toBeNull();

  act(() => vi.advanceTimersByTime(90_000));
  expect(result.current?.label).toMatch(/^Stale · since /);
});
