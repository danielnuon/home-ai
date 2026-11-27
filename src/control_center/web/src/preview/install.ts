/**
 * @file Points the app's requests and live events at the in-page mock backend.
 *
 * The app keeps talking HTTP through `src/api` exactly as it does to the server: `fetch` under the
 * API base is answered by `server.ts`, and `EventSource` reads the in-page bus. Nothing else in
 * the app knows it is a preview.
 */
import { API_BASE } from "../api/client";
import { Bus, busEventSource } from "./bus";
import { simulateActivity } from "./live";
import { handle } from "./server";
import { buildWorld, type MockWorld } from "./world";

const STEP_UP_HEADER = "X-Step-Up";

/** Reads a fetch body the app sent: always JSON text or nothing. */
function parseBody(body: BodyInit | null | undefined): unknown {
  return typeof body === "string" && body ? (JSON.parse(body) as unknown) : undefined;
}

function answer(world: MockWorld, path: string, init: RequestInit = {}): Response {
  const headers = new Headers(init.headers);
  const { status, body } = handle(world, {
    method: (init.method ?? "GET").toUpperCase(),
    path,
    body: parseBody(init.body),
    stepUp: headers.get(STEP_UP_HEADER),
  });
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Builds a fresh mock world and routes the page's API traffic to it. Returns the world. */
export function installMockServer(): MockWorld {
  const bus = new Bus();
  const clock = () => new Date();
  const world = buildWorld(bus, clock);
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    // The app always passes a path that starts with the API base (`client.ts`).
    const text = typeof input === "string" ? input : "";
    if (!text.startsWith(API_BASE)) return realFetch(input, init);
    return Promise.resolve(answer(world, text.slice(API_BASE.length), init));
  };
  window.EventSource = busEventSource(bus, clock) as unknown as typeof EventSource;
  simulateActivity(world);
  return world;
}
