/**
 * @file Two step-up requests in a row: the earlier caller is released, never left waiting.
 */
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { StepUpProvider, useStepUp } from "./StepUp";

test("a second request settles the first with null", async () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StepUpProvider>{children}</StepUpProvider>
  );
  const { result } = renderHook(() => useStepUp(), { wrapper });

  let first: Promise<string | null> = Promise.resolve("unset");
  act(() => {
    first = result.current("Resuming needs your passkey.");
    void result.current("Raising the cap needs your passkey.");
  });

  await expect(first).resolves.toBeNull();
});
