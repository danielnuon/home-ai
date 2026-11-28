/**
 * @file Area D's operations controls, driven against the preview's mock backend so the pages and
 * the mock answer together: pool mode, job times, restore drills, prune plans, won't-fix and logs.
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { Bus } from "../preview/bus";
import { handle } from "../preview/server";
import { buildWorld } from "../preview/world";
import { renderPage } from "../test/render";
import Backups from "./Backups";
import Maintenance from "./Maintenance";
import Schedule from "./Schedule";
import ServiceLogs from "./ServiceLogs";
import System from "./System";

const API = "/api/v1";

/** Answers every request from a fresh preview world, as the published preview does. */
beforeEach(() => {
  const world = buildWorld(new Bus(), () => new Date("2026-10-10T09:00:00Z"));
  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
    const path = url.startsWith(API) ? url.slice(API.length) : url;
    if (path === "/session") {
      return Promise.resolve(new Response(JSON.stringify({ csrf_token: "t" })));
    }
    const answer = handle(world, {
      method: init.method ?? "GET",
      path,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      stepUp: (init.headers as Record<string, string> | undefined)?.["X-Step-Up"] ?? null,
    });
    const body = answer.status === 204 ? null : JSON.stringify(answer.body);
    return Promise.resolve(new Response(body, { status: answer.status }));
  });
});

test("changing the pool mode shows its impact first, then switches", async () => {
  renderPage(<System />);

  await userEvent.click(await screen.findByRole("button", { name: /Change mode/ }));
  const modes = screen.getByRole("group", { name: "Pool mode" });
  const image = within(modes).getByRole("button", { name: /^Mode I/ });
  await userEvent.click(image);
  expect(image).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: /^Switch to/ }));

  expect(await screen.findByRole("button", { name: /End image mode/ })).toBeInTheDocument();
});

test("a job's start time changes in place", async () => {
  renderPage(<Schedule />);

  const changes = await screen.findAllByRole("button", { name: "Change time" });
  await userEvent.click(changes[0] as HTMLElement);
  const input = await screen.findByLabelText(/start time$/);
  await userEvent.clear(input);
  await userEvent.type(input, "04:15");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText(/now starts at 04:15/)).toBeInTheDocument();
});

test("a restore drill is added to the drill history", async () => {
  renderPage(<Backups />);

  await userEvent.click(await screen.findByRole("button", { name: /Run a restore drill/ }));

  expect(await screen.findByText(/^Today · /)).toBeInTheDocument();
});

test("a prune plan shows what it frees and can be put away", async () => {
  renderPage(<Backups />);

  await userEvent.click(await screen.findByRole("button", { name: /Start a prune plan/ }));
  expect(await screen.findByText("Frees 3.2 GB")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Discard plan/ }));

  expect(await screen.findByRole("button", { name: /Start a prune plan/ })).toBeInTheDocument();
});

test("a finding marked won't-fix keeps the reason", async () => {
  renderPage(<Maintenance />);

  const heading = await screen.findByRole("heading", { name: "Findings" });
  const section = heading.closest("section") as HTMLElement;
  const menus = within(section).getAllByRole("button", { name: /^More actions for/ });
  await userEvent.click(menus[0] as HTMLElement);
  await userEvent.click(await screen.findByRole("menuitem", { name: "Won't fix" }));
  await userEvent.type(await screen.findByLabelText("Why it won't be fixed"), "Moving soon");
  await userEvent.click(screen.getByRole("button", { name: "Mark won't fix" }));

  await waitFor(() => expect(screen.getAllByText(/Moving soon/).length).toBeGreaterThan(0));
});

test("a service's log can be narrowed to warnings and errors", async () => {
  renderPage(
    <Routes>
      <Route path="/services/:id" element={<ServiceLogs />} />
    </Routes>,
    "/services/model-router",
  );

  expect(await screen.findByText(/Kept for 30 days/)).toBeInTheDocument();
  expect(screen.getByText(/reload after SIGHUP/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Warnings and errors" }));

  await waitFor(() => expect(screen.queryByText(/reload after SIGHUP/)).not.toBeInTheDocument());
  expect(screen.getByText(/restart after 3 failed health checks/)).toBeInTheDocument();
});

test("starter mode carries a standing warning on Backups", async () => {
  renderPage(<Backups />);

  const warning = await screen.findByText(/not theft, fire/);
  expect(warning.closest(".banner")).toHaveAttribute("role", "status");
});
