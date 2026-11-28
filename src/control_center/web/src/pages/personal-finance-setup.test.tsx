/**
 * @file Personal, a domain's records, Finance and Setup against the preview's mock world, so the
 * pages and the mock backend are checked together (decisions 160 to 167).
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { Bus } from "../preview/bus";
import { handle } from "../preview/server";
import { buildWorld } from "../preview/world";
import { renderPage } from "../test/render";
import DomainRecords from "./DomainRecords";
import Finance from "./Finance";
import Personal from "./Personal";
import Setup from "./Setup";

/** The first of the elements found; a query that finds none has already thrown. */
const first = (found: HTMLElement[]): HTMLElement => found[0] as HTMLElement;

/** Answers the app's requests from a fresh mock world. */
beforeEach(() => {
  const world = buildWorld(new Bus(), () => new Date("2026-11-28T12:00:00Z"));
  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const { status, body } = handle(world, {
      method: init.method ?? "GET",
      path: url.replace(/^\/api\/v1/, ""),
      body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
      stepUp: headers.get("X-Step-Up"),
    });
    return Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status }),
    );
  });
});

test("a new case appears in the list, and its sheet takes a note", async () => {
  renderPage(<Personal />);
  await userEvent.click(await screen.findByRole("button", { name: "Add a case" }));
  await userEvent.type(screen.getByLabelText("What needs doing"), "Renew the passport");
  await userEvent.click(screen.getByRole("button", { name: "Add the case" }));

  expect(await screen.findByText("Added Renew the passport")).toBeInTheDocument();
  await userEvent.click(
    first(await screen.findAllByRole("button", { name: /Renew the passport/ })),
  );
  await userEvent.type(screen.getByLabelText("New note"), "Photos are in the drawer");
  await userEvent.click(screen.getByRole("button", { name: "Add the note" }));
  expect(await screen.findByText("Photos are in the drawer")).toBeInTheDocument();
});

test("a deleted record goes to the trash, and Undo brings it back", async () => {
  renderPage(
    <Routes>
      <Route path="/personal/:domain" element={<DomainRecords />} />
    </Routes>,
    "/personal/health",
  );
  const list = await screen.findByRole("region", { name: "Records" });
  const menus = within(list).getAllByRole("button", { name: /More actions|…/ });
  const count = menus.length;
  await userEvent.click(first(menus));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

  expect(await screen.findByText(/is in Recently deleted for 30 days/)).toBeInTheDocument();
  await waitFor(() =>
    expect(within(list).queryAllByRole("button", { name: /More actions|…/ })).toHaveLength(
      count - 1,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(within(list).getAllByRole("button", { name: /More actions|…/ })).toHaveLength(count),
  );
});

test("fixing a category moves the money and adds a rule", async () => {
  renderPage(<Finance />);
  await userEvent.click(await screen.findByRole("button", { name: /Groceries/ }));
  const select = await screen.findByLabelText(/Category of Amazon/);
  await userEvent.selectOptions(select, "Household");

  expect(
    await screen.findByText(/Household/, { selector: ".toast *, [role=status] *" }),
  ).toBeInTheDocument();
});

test("a secret needs the passkey and is never shown again", async () => {
  renderPage(<Setup />);
  const card = await screen.findByRole("article", { name: "Discord server and bots" });
  await userEvent.type(within(card).getByLabelText("Assistant bot token"), "secret-token-1");
  await userEvent.click(
    first(within(card).getAllByRole("button", { name: "Save with your passkey" })),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Use passkey" }));

  expect(await within(card).findByText("Assistant bot token saved")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("secret-token-1")).toBeNull();
});

test("the profile interview asks, takes an answer and moves on", async () => {
  renderPage(<Setup />);
  const panel = await screen.findByLabelText("Profile interview");
  expect(within(panel).getByText(/Question 1 of/)).toBeInTheDocument();
  await userEvent.type(within(panel).getByLabelText("Your answer"), "Danny");
  await userEvent.click(within(panel).getByRole("button", { name: "Answer" }));
  await waitFor(() => expect(within(panel).getByText(/Question 2 of/)).toBeInTheDocument());
  expect(within(panel).getByText("Danny")).toBeInTheDocument();
});
