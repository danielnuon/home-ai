/**
 * @file Approving shows the result at once with Undo; a refusal shows the server's reason.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { expect, test } from "vitest";
import { fakeServer, renderPage } from "../test/render";
import { makeApproval } from "../test/factories";
import Approvals from "./Approvals";

test("approve, then undo within the window", async () => {
  const sent = fakeServer({
    "GET /api/approvals": () => [makeApproval()],
    "POST /api/approvals/AP-1/decision": () => makeApproval({ state: "approved" }),
    "POST /api/approvals/AP-1/undo": () => makeApproval(),
  });
  renderPage(<Approvals />);

  await userEvent.click(await screen.findByRole("button", { name: "Approve" }));
  expect(await screen.findByText("Approved: Reply to Dr. Patel")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Undo" }));

  expect(sent.find((r) => r.path.endsWith("/decision"))?.body).toEqual({
    decision: "approve",
    reason: null,
  });
  expect(sent.some((r) => r.path.endsWith("/undo"))).toBe(true);
});

test("deny sends the reason to the employee", async () => {
  const sent = fakeServer({
    "GET /api/approvals": () => [makeApproval()],
    "POST /api/approvals/AP-1/decision": () => makeApproval({ state: "denied" }),
  });
  renderPage(<Approvals />);

  await userEvent.click(await screen.findByRole("button", { name: "Deny" }));
  await userEvent.type(screen.getByLabelText("Reason for the employee (optional)"), "Wrong day");
  await userEvent.click(screen.getByRole("button", { name: "Deny with reason" }));

  expect(await screen.findByText("Denied: Reply to Dr. Patel")).toBeInTheDocument();
  expect(sent.find((r) => r.path.endsWith("/decision"))?.body).toEqual({
    decision: "deny",
    reason: "Wrong day",
  });
});

test("a refusal shows the server's reason", async () => {
  fakeServer({
    "GET /api/approvals": () => [makeApproval()],
    "POST /api/approvals/AP-1/decision": () => ({
      status: 409,
      body: { error: "conflict", reason: "This approval was already decided in Discord." },
    }),
  });
  renderPage(<Approvals />);

  await userEvent.click(await screen.findByRole("button", { name: "Approve" }));

  expect(
    await screen.findByText("This approval was already decided in Discord."),
  ).toBeInTheDocument();
});

test("a lapsed approval says nothing was sent", async () => {
  fakeServer({ "GET /api/approvals": () => [makeApproval({ state: "expired" })] });
  renderPage(<Approvals />);

  expect(await screen.findByText("Lapsed. Nothing was sent.")).toBeInTheDocument();
});

test("the page has no detectable accessibility violations", async () => {
  fakeServer({ "GET /api/approvals": () => [makeApproval()] });
  const { container } = renderPage(<Approvals />);
  await screen.findByRole("button", { name: "Approve" });

  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });

  expect(results.violations.map((v) => v.id)).toEqual([]);
});
