/**
 * @file Loosening asks for the passkey and retries with the proof; tightening goes straight through.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { fakeServer, renderPage } from "../test/render";
import { makeContacts } from "../test/factories";
import Contacts from "./Contacts";

test("raising trust steps up with a passkey, then retries with the proof", async () => {
  const sent = fakeServer({
    "GET /api/contacts": () => makeContacts("known"),
    "PUT /api/contacts/C-1/trust": (request) =>
      request.headers["X-Step-Up"] === "proof-1"
        ? { id: "C-1", name: "A-1 Plumbing", meta: "", trust: "allowlisted" }
        : {
            status: 403,
            body: { error: "step_up_required", reason: "Allowlisting needs your passkey." },
          },
    "POST /api/step-up/challenge": () => ({ challenge: "abc" }),
    "POST /api/step-up/verify": () => ({ proof: "proof-1", expires_at: "2026-10-28T12:00:00Z" }),
  });
  renderPage(<Contacts />);

  await userEvent.selectOptions(
    await screen.findByLabelText("Trust for A-1 Plumbing"),
    "allowlisted",
  );
  expect(await screen.findByText("Allowlisting needs your passkey.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Use passkey" }));

  await waitFor(() => expect(screen.getByText("Trust updated")).toBeInTheDocument());
  const verify = sent.find((r) => r.path === "/api/step-up/verify");
  expect(verify?.body).toEqual({ challenge: "abc", assertion: "virtual:abc" });
  const retried = sent.filter((r) => r.method === "PUT").at(-1);
  expect(retried?.headers["X-Step-Up"]).toBe("proof-1");
  expect(retried?.headers["X-CSRF-Token"]).toBe("test-csrf");
});

test("lowering trust takes one tap, with no passkey", async () => {
  const sent = fakeServer({
    "GET /api/contacts": () => makeContacts("allowlisted"),
    "PUT /api/contacts/C-1/trust": () => ({
      id: "C-1",
      name: "A-1 Plumbing",
      meta: "",
      trust: "blocked",
    }),
  });
  renderPage(<Contacts />);

  await userEvent.selectOptions(await screen.findByLabelText("Trust for A-1 Plumbing"), "blocked");

  expect(await screen.findByText("Trust updated")).toBeInTheDocument();
  expect(sent.some((r) => r.path.startsWith("/api/step-up"))).toBe(false);
});

test("cancelling the passkey changes nothing", async () => {
  const sent = fakeServer({
    "GET /api/contacts": () => makeContacts("known"),
    "PUT /api/contacts/C-1/trust": () => ({
      status: 403,
      body: { error: "step_up_required", reason: "Allowlisting needs your passkey." },
    }),
  });
  renderPage(<Contacts />);

  await userEvent.selectOptions(
    await screen.findByLabelText("Trust for A-1 Plumbing"),
    "allowlisted",
  );
  await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

  expect(sent.filter((r) => r.method === "PUT")).toHaveLength(1);
});
