/**
 * @file Accounts, security and money: each page manages its items in place, tightening takes one
 * tap, loosening asks for the passkey, and a raised cap shows its impact before it applies.
 *
 * The pages talk to the preview's mock backend, which answers as the server does (parity.test.ts).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import type { SettingsIndex } from "../api/types";
import { SettingRow } from "../components/SettingControl";
import { Bus } from "../preview/bus";
import { handle } from "../preview/server";
import { buildWorld } from "../preview/world";
import { fakeServer, renderPage } from "../test/render";
import Connections from "./Connections";
import Security from "./Security";
import Spend from "./Spend";
import Voice from "./Voice";

/** The first item, which the test requires to exist. */
function first<Item>(items: Item[]): Item {
  const [item] = items;
  if (item === undefined) throw new Error("Expected at least one");
  return item;
}

/** A fake server whose listed routes are answered by a fresh preview world. */
function mockBackend(routes: string[]) {
  let counter = 0;
  const world = buildWorld(
    new Bus(),
    () => new Date(),
    () => `id${++counter}`,
  );
  const handlers = Object.fromEntries(
    routes.map((route) => {
      const [method = "GET", path = "/"] = route.split(" ");
      return [
        `${method} /api/v1${path}`,
        (request: { query: URLSearchParams; body: unknown; headers: Record<string, string> }) => {
          const query = request.query.toString();
          return handle(world, {
            method,
            path: query ? `${path}?${query}` : path,
            body: request.body,
            stepUp: request.headers["X-Step-Up"] ?? null,
          });
        },
      ];
    }),
  );
  const proof = () => {
    world.stepUpProofs.set("proof-1", new Date(Date.now() + 60_000));
    return { proof: "proof-1", expires_at: new Date(Date.now() + 60_000).toISOString() };
  };
  const stepUp = {
    "POST /api/v1/step-up/challenge": () => ({ challenge: "abc" }),
    "POST /api/v1/step-up/verify": proof,
  };
  return { world, sent: fakeServer({ ...stepUp, ...handlers }) };
}

test("a connection's sheet shows its scopes, expiry and last push, and disconnects in one tap", async () => {
  const { sent } = mockBackend(["GET /connections", "POST /connections/github/disconnect"]);
  renderPage(<Connections />);

  await userEvent.click(await screen.findByRole("button", { name: /^GitHub/ }));
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByText(/Jan 22, 2027/)).toBeInTheDocument();
  expect(within(sheet).getByText(/receipt-scanner · Oct 25/)).toBeInTheDocument();
  await userEvent.click(within(sheet).getByRole("button", { name: /Remove key|Disconnect/ }));

  await waitFor(() =>
    expect(sent.some((r) => r.path.startsWith("/api/v1/connections/github/"))).toBe(true),
  );
  expect(sent.some((r) => r.path.startsWith("/api/v1/step-up"))).toBe(false);
});

test("adding a stock voice takes one tap and needs no passkey", async () => {
  const { sent } = mockBackend(["GET /voice", "GET /settings", "POST /voice/profiles"]);
  renderPage(<Voice />);

  await userEvent.click(await screen.findByRole("button", { name: "Add a voice" }));
  const sheet = await screen.findByRole("dialog");
  await userEvent.click(first(within(sheet).getAllByRole("button", { name: "Add" })));

  await waitFor(() =>
    expect(sent.find((r) => r.method === "POST")?.body).toMatchObject({ kind: "stock" }),
  );
  expect(sent.some((r) => r.path.startsWith("/api/v1/step-up"))).toBe(false);
});

test("stopping a workspace is one tap; new recovery codes need the passkey and show once", async () => {
  const { sent } = mockBackend([
    "GET /security",
    "POST /security/workspaces/ws-brain/stop",
    "POST /security/recovery-codes",
  ]);
  renderPage(<Security />);

  await userEvent.click(first(await screen.findAllByRole("button", { name: "Stop" })));
  await waitFor(() =>
    expect(sent.some((r) => r.path === "/api/v1/security/workspaces/ws-brain/stop")).toBe(true),
  );

  await userEvent.click(screen.getByRole("button", { name: "New codes" }));
  await userEvent.click(await screen.findByRole("button", { name: "Use passkey" }));
  const sheet = await screen.findByRole("dialog", { name: "New recovery codes" });
  expect(within(sheet).getByRole("button", { name: "I've saved it" })).toBeInTheDocument();
  const retried = sent.filter((r) => r.path === "/api/v1/security/recovery-codes").at(-1);
  expect(retried?.headers["X-Step-Up"]).toBe("proof-1");
});

test("the ledger regroups by pipeline", async () => {
  mockBackend(["GET /spend"]);
  renderPage(<Spend />);

  expect(await screen.findByText(/Forecast for October/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Pipeline" }));
  expect(await screen.findByText("B · Development")).toBeInTheDocument();
});

test("raising a cap shows its impact first, and applies only when confirmed", async () => {
  const { world, sent } = mockBackend([
    "GET /settings/budget.voice/impact",
    "PUT /settings/budget.voice",
  ]);
  const index = handle(world, { method: "GET", path: "/settings" }).body as SettingsIndex;
  const setting = first(index.settings.filter((s) => s.key === "budget.voice"));
  renderPage(<SettingRow setting={setting} />);

  const field = screen.getByLabelText(/monthly cap in dollars/);
  await userEvent.clear(field);
  await userEvent.type(field, "10");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByText("Most this can spend a month")).toBeInTheDocument();
  expect(sent.some((r) => r.method === "PUT")).toBe(false);
  await userEvent.click(within(sheet).getByRole("button", { name: "Apply" }));
  await waitFor(() => expect(sent.some((r) => r.method === "PUT")).toBe(true));
});
