/**
 * @file Runs one Memory view action and puts the view it answers with on screen at once.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "../../api/actions";
import { send } from "../../api/client";
import type { MemoryOverview } from "../../api/types";

/** Posts to a memory endpoint; the answer replaces the Memory view, and Chat refetches. */
export function useMemoryAction() {
  const client = useQueryClient();
  const action = useAction<MemoryOverview>({ refresh: ["chat"] });
  const run = async (path: string, body?: unknown, method: "POST" | "PUT" = "POST") => {
    const answer = await action.run(() => send<MemoryOverview>(method, path, body));
    if (answer) client.setQueryData(["memory"], answer);
    return answer;
  };
  return { run, busy: action.busy };
}
