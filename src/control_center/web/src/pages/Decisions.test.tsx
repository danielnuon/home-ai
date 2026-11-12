/**
 * @file A decision stays vetoable from Brain after it is acknowledged and in effect (spec 7.2).
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { makeDecision } from "../test/factories";
import { fakeServer, renderPage } from "../test/render";
import Decisions from "./Decisions";

test("an acknowledged decision in effect can still be vetoed", async () => {
  const sent = fakeServer({
    "GET /api/decisions": () => [makeDecision()],
    "POST /api/decisions/CDR-1/veto": () => makeDecision({ status: "reversed", vetoable: false }),
  });
  renderPage(<Decisions />);

  await userEvent.click(await screen.findByRole("button", { name: "Veto…" }));
  await userEvent.click(screen.getByRole("button", { name: "Veto" }));

  expect(sent.find((r) => r.path.endsWith("/veto"))?.body).toEqual({ reason: null });
});

test("a reversed decision offers no veto", async () => {
  fakeServer({
    "GET /api/decisions": () => [makeDecision({ status: "reversed", vetoable: false })],
  });
  renderPage(<Decisions />);

  expect(await screen.findByText("Use the smaller embedding model")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Veto…" })).not.toBeInTheDocument();
});
