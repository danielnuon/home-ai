/**
 * @file Keeps every open page current from the server's event stream (spec 7.13).
 *
 * One EventSource per tab. `changed` events refetch the named resources; `task.progress`,
 * `transcript.append` and `chat.message` patch the cached data in place, because they arrive
 * several times a second and a refetch each time would break the stream budget in 7.17.
 *
 * While the app is in the background the stream is closed; on return it reopens from the last
 * event id, and the server replays what was missed.
 */
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ChatMessage, ChatThread, LiveTask, TaskDetail, TodayOverview } from "./types";

/** Settings are shown on the pages that own them, so a settings change refreshes those too. */
const ALSO_REFRESH: Record<string, string[]> = {
  settings: ["spend", "models", "voice", "connections", "schedule", "today", "platform"],
};

interface TaskProgress {
  task_id: string;
  tokens_per_second: number | null;
  state: LiveTask["state"];
}

interface TranscriptAppend {
  task_id: string;
  entry?: TaskDetail["transcript"][number];
  entry_id?: string;
  text_delta?: string;
}

/** Refetches every query whose key starts with one of `resources` ("*" means all). */
function refresh(client: QueryClient, resources: string[]): void {
  if (resources.includes("*")) {
    void client.invalidateQueries();
    return;
  }
  const names = new Set(resources.flatMap((name) => [name, ...(ALSO_REFRESH[name] ?? [])]));
  void client.invalidateQueries({ predicate: (query) => names.has(String(query.queryKey[0])) });
}

/** Applies a token-rate update to the Live list and to Today's tasks and team. */
function applyProgress(client: QueryClient, progress: TaskProgress): void {
  const patch = (task: LiveTask) =>
    task.id === progress.task_id
      ? { ...task, tokens_per_second: progress.tokens_per_second, state: progress.state }
      : task;
  client.setQueryData<LiveTask[]>(["live"], (tasks) => tasks?.map(patch));
  client.setQueryData<TodayOverview>(["today"], (today) => {
    if (!today) return today;
    const tasks = today.tasks.map(patch);
    const rateByEmployee = new Map(tasks.map((t) => [t.employee_id, t.tokens_per_second]));
    const team = today.team.map((m) => ({
      ...m,
      tokens_per_second: rateByEmployee.get(m.id) ?? m.tokens_per_second,
    }));
    return { ...today, tasks, team };
  });
}

/** Adds a transcript entry, or more text to an open one. */
function applyTranscript(client: QueryClient, append: TranscriptAppend): void {
  client.setQueryData<TaskDetail>(["live", append.task_id], (detail) => {
    if (!detail) return detail;
    if (append.entry) {
      return { ...detail, transcript: [...detail.transcript, append.entry] };
    }
    const transcript = detail.transcript.map((entry) =>
      entry.id === append.entry_id
        ? { ...entry, text: entry.text + (append.text_delta ?? "") }
        : entry,
    );
    return { ...detail, transcript };
  });
}

/** Replaces a streaming chat message by id, or appends it if it is new. */
function applyChat(client: QueryClient, message: ChatMessage): void {
  client.setQueryData<ChatThread>(["chat", message.lead_id], (thread) => {
    if (!thread) return thread;
    const known = thread.messages.some((m) => m.id === message.id);
    const messages = known
      ? thread.messages.map((m) => (m.id === message.id ? message : m))
      : [...thread.messages, message];
    return { ...thread, messages };
  });
}

/**
 * Opens the stream and wires each event kind to the cache. With `after`, the server first replays
 * every event newer than it; without, the stream starts from now.
 */
function openStream(
  client: QueryClient,
  after: number | null,
  onId: (id: number) => void,
): EventSource {
  const source = new EventSource(after === null ? "/api/events" : `/api/events?after=${after}`);
  const listen = <Payload>(kind: string, apply: (payload: Payload) => void) =>
    source.addEventListener(kind, (event: MessageEvent<string>) => {
      onId(Number(event.lastEventId));
      apply(JSON.parse(event.data) as Payload);
    });
  listen<{ resources: string[] }>("changed", (p) => refresh(client, p.resources));
  listen<TaskProgress>("task.progress", (p) => applyProgress(client, p));
  listen<TranscriptAppend>("transcript.append", (p) => applyTranscript(client, p));
  listen<ChatMessage>("chat.message", (p) => applyChat(client, p));
  return source;
}

/** Subscribes the app to live events for as long as it is mounted and visible. */
export function useLiveEvents(): void {
  const client = useQueryClient();
  useEffect(() => {
    let lastId: number | null = null;
    let source: EventSource | null = null;
    const connect = () => {
      source = openStream(client, lastId, (id) => (lastId = Math.max(lastId ?? 0, id)));
    };
    const onVisibility = () => {
      source?.close();
      source = null;
      if (document.visibilityState === "visible") {
        connect();
      }
    };
    connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      source?.close();
    };
  }, [client]);
}
