/**
 * @file A tile not refreshed for 3 minutes turns grey and says "stale" (spec 7.3).
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Metric } from "../api/types";
import { MetricTiles } from "./Rows";

const SAMPLED = "2026-10-29T14:00:00Z";

function memory(overrides: Partial<Metric> = {}): Metric {
  return {
    name: "Memory pressure",
    value: "Normal",
    status: { status: "healthy", label: "Healthy" },
    spark: [],
    sampled_at: SAMPLED,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
});

afterEach(() => {
  vi.useRealTimers();
});

test("a fresh tile shows its own status", () => {
  vi.setSystemTime(Date.parse(SAMPLED) + 2 * 60_000);
  render(<MetricTiles metrics={[memory()]} />);

  expect(screen.getByText("Healthy")).toBeInTheDocument();
});

test("the tile goes stale once its sample is 3 minutes old, without a new render", () => {
  vi.setSystemTime(Date.parse(SAMPLED) + 2 * 60_000);
  const { container } = render(<MetricTiles metrics={[memory()]} />);

  act(() => vi.advanceTimersByTime(75_000));

  expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
  expect(screen.getByText(/^Stale · since/)).toBeInTheDocument();
  expect(container.querySelector(".tile.stale")).not.toBeNull();
});

test("a figure that is not a live sample never goes stale", () => {
  vi.setSystemTime(Date.parse(SAMPLED) + 60 * 60_000);
  render(<MetricTiles metrics={[memory({ sampled_at: null })]} />);

  expect(screen.getByText("Healthy")).toBeInTheDocument();
});
