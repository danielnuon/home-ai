/**
 * @file Things that lead somewhere are pressable surfaces, opened in place where they can be
 * (spec 7.16, rule 11): a decision's reasoning expands inside its card, and an approval named in a
 * chat message opens in the sheet.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { makeApproval, makeDecision } from "../test/factories";
import { fakeServer, renderPage } from "../test/render";
import { ApprovalPeek } from "./ApprovalPeek";
import { DecisionCard } from "./DecisionCard";

test("a short decision card expands its reasoning in place", async () => {
  renderPage(<DecisionCard decision={makeDecision()} />);
  const toggle = screen.getByRole("button", { name: /Why, what else was weighed/ });
  expect(screen.queryByText("Search quality held in the evaluation.")).not.toBeInTheDocument();

  await userEvent.click(toggle);

  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Search quality held in the evaluation.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Details" })).not.toBeInTheDocument();
});

test("an approval named in a message opens in the sheet, ready to answer", async () => {
  const approval = makeApproval();
  fakeServer({ "GET /api/v1/approvals": () => [approval] });
  renderPage(<ApprovalPeek approvalId={approval.id} />);

  await userEvent.click(screen.getByRole("button", { name: /Review approval/ }));

  expect(await screen.findByRole("dialog", { name: "Approval" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /^Approve/ })).toBeInTheDocument();
});
