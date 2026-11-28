/**
 * @file Approving shows the result at once with Undo; a refusal shows the server's reason.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { expect, test } from "vitest";
import { fakeServer, renderPage } from "../test/render";
import { makeApproval } from "../test/factories";
import Approvals from "./Approvals";

test("approve, then undo within the window", async () => {
  const sent = fakeServer({
    "GET /api/v1/approvals": () => [makeApproval()],
    "POST /api/v1/approvals/AP-1/decision": () => makeApproval({ state: "approved" }),
    "POST /api/v1/approvals/AP-1/undo": () => makeApproval(),
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
    "GET /api/v1/approvals": () => [makeApproval()],
    "POST /api/v1/approvals/AP-1/decision": () => makeApproval({ state: "denied" }),
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
    "GET /api/v1/approvals": () => [makeApproval()],
    "POST /api/v1/approvals/AP-1/decision": () => ({
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
  fakeServer({ "GET /api/v1/approvals": () => [makeApproval({ state: "expired" })] });
  renderPage(<Approvals />);

  expect(await screen.findByText("Lapsed. Nothing was sent.")).toBeInTheDocument();
});

test("the page has no detectable accessibility violations", async () => {
  fakeServer({ "GET /api/v1/approvals": () => [makeApproval()] });
  const { container } = renderPage(<Approvals />);
  await screen.findByRole("button", { name: "Approve" });

  // jsdom has no layout or colour, so contrast is checked in a real browser by `make a11y`.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });

  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test("the draft can be reworded before approving", async () => {
  const sent = fakeServer({
    "GET /api/v1/approvals": () => [makeApproval()],
    "PUT /api/v1/approvals/AP-1/draft": () => makeApproval({ draft: "Tuesday works." }),
  });
  renderPage(<Approvals />);

  await userEvent.click(await screen.findByRole("button", { name: "Edit draft" }));
  const field = screen.getByLabelText("Draft for Reply to Dr. Patel");
  await userEvent.clear(field);
  await userEvent.type(field, "Tuesday works.");
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

  expect(await screen.findByText("Draft saved")).toBeInTheDocument();
  expect(sent.find((r) => r.path.endsWith("/draft"))?.body).toEqual({ draft: "Tuesday works." });
});

test("a message can be left out of a batch", async () => {
  const batch = [
    { id: "B-1", recipient: "Unit A tenant", summary: "Rent reminder", included: true },
    { id: "B-2", recipient: "Unit B tenant", summary: "Rent reminder", included: true },
  ];
  const sent = fakeServer({
    "GET /api/v1/approvals": () => [makeApproval({ draft: null, batch })],
    "PUT /api/v1/approvals/AP-1/batch/B-2": () => makeApproval({ draft: null, batch }),
  });
  renderPage(<Approvals />);

  expect(await screen.findByText("Sending 2 of 2")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: /Unit B tenant/ }));

  expect(sent.find((r) => r.path.endsWith("/batch/B-2"))?.body).toEqual({ included: false });
});

test("Always allow this contact shows only for a saved contact who isn't allowlisted", async () => {
  fakeServer({
    "GET /api/v1/approvals": () => [
      makeApproval({ id: "AP-1", recipient_trust: "known" }),
      makeApproval({ id: "AP-2", title: "Second", recipient_trust: "allowlisted" }),
    ],
  });
  renderPage(<Approvals />);

  expect(await screen.findAllByRole("button", { name: "Always allow this contact" })).toHaveLength(
    1,
  );
});

test("filters narrow the cards and live in the address", async () => {
  fakeServer({
    "GET /api/v1/approvals": () => [
      makeApproval({ id: "AP-1", domain: "Health" }),
      makeApproval({ id: "AP-2", title: "Send the rent receipt", domain: "Rental" }),
    ],
  });
  renderPage(<Approvals />, "/approvals?domain=Rental");

  expect(await screen.findByText("Send the rent receipt")).toBeInTheDocument();
  expect(screen.queryByText("Reply to Dr. Patel")).not.toBeInTheDocument();
  await userEvent.click(within(screen.getByRole("group", { name: "Domain" })).getByText("All"));
  expect(await screen.findByText("Reply to Dr. Patel")).toBeInTheDocument();
});
