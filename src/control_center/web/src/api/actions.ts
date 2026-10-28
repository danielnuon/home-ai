/**
 * @file The one way a page changes something on the server.
 *
 * `useAction` wraps a request so every button behaves the same (spec 7.15, "one action, one
 * meaning"): it shows the result at once, asks for a passkey when the gate says a change loosens
 * something and retries with the proof, and turns any refusal into a toast carrying the server's
 * reason, so no error is a dead end (7.16, rule 9).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useStepUp } from "../components/StepUp";
import { useToast } from "../components/Toasts";
import { ApiError } from "./client";

/** A request that may carry a step-up proof. */
type Request<Result> = (stepUp?: string) => Promise<Result>;

interface ActionOptions<Result> {
  /** Resources to refetch at once, ahead of the server's change event. */
  refresh?: string[];
  /** A toast to show on success, built from the answer. */
  done?: (result: Result) => string | { message: string; undo?: () => void };
}

/** Sends `request`, stepping up and retrying once if the gate asks for a passkey. */
async function withStepUp<Result>(
  request: Request<Result>,
  askForProof: (reason: string) => Promise<string | null>,
): Promise<Result | null> {
  try {
    return await request();
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "step_up_required") throw error;
    const proof = await askForProof(error.reason);
    return proof === null ? null : await request(proof);
  }
}

/**
 * Returns `run`, which performs the request, and `busy`, true while it is in flight.
 *
 * @param options - What to refresh and what to say once it worked.
 * @returns The runner and the busy flag.
 */
export function useAction<Result>(options: ActionOptions<Result> = {}) {
  const client = useQueryClient();
  const askForProof = useStepUp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { refresh = [], done } = options;

  const run = async (request: Request<Result>): Promise<Result | null> => {
    setBusy(true);
    try {
      const result = await withStepUp(request, askForProof);
      if (result === null) return null;
      refresh.forEach((name) => void client.invalidateQueries({ queryKey: [name] }));
      const said = done?.(result);
      if (said) toast(typeof said === "string" ? { message: said } : said);
      return result;
    } catch (error) {
      const message = error instanceof ApiError ? error.reason : "Couldn't reach Brain. Try again.";
      toast({ message, tone: "problem" });
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { run, busy };
}
