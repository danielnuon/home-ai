/**
 * @file Writes recover from a lost session instead of failing until the page is reloaded.
 */
import { beforeEach, expect, test, vi } from "vitest";
import { fakeServer } from "../test/render";

// The session token is module state; each test starts from a page that has not opened one yet.
let send: typeof import("./client").send;
beforeEach(async () => {
  vi.resetModules();
  ({ send } = await import("./client"));
});

test("a failed session open is not reused by the next write", async () => {
  let opens = 0;
  fakeServer({
    "GET /api/session": () =>
      ++opens === 1 ? { status: 503, body: { reason: "Starting" } } : { csrf_token: "fresh" },
    "POST /api/platform/stop": () => ({ stopped: true }),
  });

  await expect(send("POST", "/platform/stop")).rejects.toMatchObject({ status: 503 });
  await expect(send("POST", "/platform/stop")).resolves.toEqual({ stopped: true });
});

test("an expired session is reopened and the write retried once with the new token", async () => {
  let opens = 0;
  const sent = fakeServer({
    "GET /api/session": () => ({ csrf_token: `token-${++opens}` }),
    "POST /api/platform/stop": (request) =>
      request.headers["X-CSRF-Token"] === "token-1"
        ? { status: 403, body: { error: "session_expired", reason: "Your session expired." } }
        : { stopped: true },
  });

  await expect(send("POST", "/platform/stop")).resolves.toEqual({ stopped: true });
  expect(sent.filter((r) => r.method === "POST")).toHaveLength(2);
});

test("a step-up request is not mistaken for an expired session", async () => {
  const sent = fakeServer({
    "POST /api/platform/resume": () => ({
      status: 403,
      body: { error: "step_up_required", reason: "Resuming needs your passkey." },
    }),
  });

  await expect(send("POST", "/platform/resume")).rejects.toMatchObject({
    code: "step_up_required",
  });
  expect(sent.filter((r) => r.method === "POST")).toHaveLength(1);
});
