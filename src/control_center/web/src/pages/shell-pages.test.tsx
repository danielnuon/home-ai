/**
 * @file The shell's pages: the Guide panel asks about the page on screen, the Docs reader turns a
 * request into a work item, and Recently deleted restores with one press.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";
import { GuideProvider, useGuide } from "../shell/Guide";
import { fakeServer, renderPage } from "../test/render";
import DocReader from "./DocReader";
import Trash from "./Trash";

const DOC = {
  id: "infra",
  title: "INFRASTRUCTURE.md",
  meta: "Checks, recovery, remote login",
  status: { status: "healthy", label: "Approved" },
  blocks: [
    { kind: "heading", text: "Checks" },
    { kind: "paragraph", text: "The watchdog reads every service's health." },
  ],
};

function reader() {
  return (
    <GuideProvider>
      <Routes>
        <Route path="/docs/:id" element={<DocReader />} />
      </Routes>
    </GuideProvider>
  );
}

test("the Guide panel asks Wayfinder about the document on screen", async () => {
  const sent = fakeServer({
    "GET /api/v1/docs/infra": () => DOC,
    "POST /api/v1/guide/ask": () => ({
      id: "GA-1",
      question: "What is this page for?",
      page: "/docs/infra",
      answer: "About INFRASTRUCTURE.md: how this Mac is set up.",
      sources: [{ title: "INFRASTRUCTURE.md", href: "/docs/infra" }],
    }),
  });
  renderPage(reader(), "/docs/infra");

  await userEvent.click(
    await screen.findByRole("button", { name: "Ask Wayfinder about this page" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "What is this page for?" }));

  expect(
    await screen.findByText("About INFRASTRUCTURE.md: how this Mac is set up."),
  ).toBeInTheDocument();
  const ask = sent.find((r) => r.path === "/api/v1/guide/ask");
  expect(ask?.body).toEqual({
    question: "What is this page for?",
    page: "/docs/infra",
    context: "INFRASTRUCTURE.md",
  });
});

test("a change request on a document becomes a work item", async () => {
  const sent = fakeServer({
    "GET /api/v1/docs/infra": () => DOC,
    "POST /api/v1/docs/infra/change-requests": () => ({
      work_item_id: "WI-9",
      message: "Requested. WI-9 is on Work.",
    }),
  });
  renderPage(reader(), "/docs/infra");

  await userEvent.click(await screen.findByRole("button", { name: "Request a change" }));
  await userEvent.type(screen.getByLabelText("What should change"), "Add the new drive.");
  await userEvent.click(screen.getByRole("button", { name: "Request the change" }));

  expect(await screen.findByText("Requested. WI-9 is on Work.")).toBeInTheDocument();
  const made = sent.find((r) => r.method === "POST");
  expect(made?.body).toEqual({ text: "Add the new drive." });
});

test("restoring from Recently deleted takes one press and says where it went", async () => {
  const sent = fakeServer({
    "GET /api/v1/trash": () => ({
      retention_days: 30,
      items: [
        {
          id: "TR-7",
          kind: "rule",
          title: "File Costco receipts",
          meta: "Finance rule",
          home: "/finance",
          deleted_at: "2026-11-26T12:00:00Z",
          purge_at: "2026-12-26T12:00:00Z",
        },
      ],
    }),
    "POST /api/v1/trash/TR-7/restore": () => ({ home: "/finance" }),
  });
  renderPage(
    <GuideProvider>
      <Trash />
    </GuideProvider>,
  );

  await userEvent.click(await screen.findByRole("button", { name: "Restore" }));

  await waitFor(() => expect(screen.getByText("Restored to Finance")).toBeInTheDocument());
  expect(sent.some((r) => r.path === "/api/v1/trash/TR-7/restore")).toBe(true);
});

test("the Guide opens from anywhere through useGuide", async () => {
  fakeServer({});
  function Opener() {
    const { open } = useGuide();
    return (
      <button type="button" onClick={() => open("Unit B lease")}>
        open
      </button>
    );
  }
  renderPage(
    <GuideProvider>
      <Opener />
    </GuideProvider>,
  );

  await userEvent.click(screen.getByRole("button", { name: "open" }));
  expect(await screen.findByText(/About Unit B lease/)).toBeInTheDocument();
});
