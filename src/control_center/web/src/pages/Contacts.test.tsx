/**
 * @file Contacts: loosening asks for the passkey and retries with the proof, tightening goes
 * straight through, and removing lists what mentions the contact before it goes to the trash.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { fakeServer, renderPage } from "../test/render";
import { makeContacts } from "../test/factories";
import type { Contact, ContactDetail } from "../api/types";
import Contacts from "./Contacts";

/** The sheet for the one contact in `makeContacts`. */
function detail(trust: "known" | "allowlisted" = "known"): ContactDetail {
  return {
    contact: makeContacts(trust).contacts[0] as Contact,
    history: [],
    mentions: [{ kind: "draft", id: "AP-9", title: "Book the plumber", href: "/approvals" }],
  };
}

test("raising trust steps up with a passkey, then retries with the proof", async () => {
  const sent = fakeServer({
    "GET /api/v1/contacts": () => makeContacts("known"),
    "GET /api/v1/contacts/C-1": () => detail("known"),
    "PUT /api/v1/contacts/C-1/trust": (request) =>
      request.headers["X-Step-Up"] === "proof-1"
        ? { ...makeContacts("allowlisted").contacts[0] }
        : {
            status: 403,
            body: { error: "step_up_required", reason: "Allowlisting needs your passkey." },
          },
    "POST /api/v1/step-up/challenge": () => ({ challenge: "abc" }),
    "POST /api/v1/step-up/verify": () => ({ proof: "proof-1", expires_at: "2026-10-28T12:00:00Z" }),
  });
  renderPage(<Contacts />, "/contacts?contact=C-1");

  await userEvent.selectOptions(
    await screen.findByLabelText("Trust for A-1 Plumbing"),
    "allowlisted",
  );
  expect(await screen.findByText("Allowlisting needs your passkey.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Use passkey" }));

  await waitFor(() => expect(screen.getByText("Trust updated")).toBeInTheDocument());
  const verify = sent.find((r) => r.path === "/api/v1/step-up/verify");
  expect(verify?.body).toEqual({ challenge: "abc", assertion: "virtual:abc" });
  const retried = sent.filter((r) => r.method === "PUT").at(-1);
  expect(retried?.headers["X-Step-Up"]).toBe("proof-1");
  expect(retried?.headers["X-CSRF-Token"]).toBe("test-csrf");
});

test("lowering trust takes one tap, with no passkey", async () => {
  const sent = fakeServer({
    "GET /api/v1/contacts": () => makeContacts("allowlisted"),
    "PUT /api/v1/contacts/C-1/trust": () => ({ ...makeContacts("blocked").contacts[0] }),
  });
  renderPage(<Contacts />);

  await userEvent.click(await screen.findByRole("button", { name: "Block" }));

  expect(await screen.findByText("Trust updated")).toBeInTheDocument();
  expect(sent.some((r) => r.path.startsWith("/api/v1/step-up"))).toBe(false);
});

test("cancelling the passkey changes nothing", async () => {
  const sent = fakeServer({
    "GET /api/v1/contacts": () => makeContacts("known"),
    "GET /api/v1/contacts/C-1": () => detail("known"),
    "PUT /api/v1/contacts/C-1/trust": () => ({
      status: 403,
      body: { error: "step_up_required", reason: "Allowlisting needs your passkey." },
    }),
  });
  renderPage(<Contacts />, "/contacts?contact=C-1");

  await userEvent.selectOptions(
    await screen.findByLabelText("Trust for A-1 Plumbing"),
    "allowlisted",
  );
  await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

  expect(sent.filter((r) => r.method === "PUT")).toHaveLength(1);
});

test("removing a contact lists what mentions it, then offers Undo", async () => {
  const sent = fakeServer({
    "GET /api/v1/contacts": () => makeContacts("known"),
    "GET /api/v1/contacts/C-1": () => detail("known"),
    "POST /api/v1/contacts/C-1/remove": () => ({
      trash_id: "TR-9",
      message: "A-1 Plumbing moved to Recently deleted.",
    }),
    "POST /api/v1/trash/TR-9/restore": () => ({ id: "TR-9" }),
  });
  renderPage(<Contacts />, "/contacts?contact=C-1&view=remove");

  expect(await screen.findByText("Book the plumber")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Remove A-1 Plumbing" }));
  expect(await screen.findByText("A-1 Plumbing moved to Recently deleted.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Undo" }));

  await waitFor(() => expect(sent.some((r) => r.path.endsWith("/TR-9/restore"))).toBe(true));
});

test("adding a contact sends its channels", async () => {
  const sent = fakeServer({
    "GET /api/v1/contacts": () => makeContacts("known"),
    "POST /api/v1/contacts": () => ({
      ...makeContacts("known").contacts[0],
      name: "Northside Vet",
    }),
  });
  renderPage(<Contacts />);

  await userEvent.click(await screen.findByRole("button", { name: "Add a contact" }));
  await userEvent.type(screen.getByLabelText("Name"), "Northside Vet");
  await userEvent.type(screen.getByLabelText("Channel 1"), "vet@example.org");
  await userEvent.click(screen.getByRole("button", { name: "Add contact" }));

  expect(await screen.findByText("Added Northside Vet")).toBeInTheDocument();
  expect(sent.find((r) => r.method === "POST" && r.path === "/api/v1/contacts")?.body).toEqual({
    name: "Northside Vet",
    area: "",
    principal: "owner",
    channels: [{ kind: "email", value: "vet@example.org" }],
    trust: "known",
  });
});

test("mapping an account to a principal asks for the passkey", async () => {
  const sent = fakeServer({
    "GET /api/v1/contacts": () => makeContacts("known"),
    "PUT /api/v1/principals/owner/accounts": (request) =>
      request.headers["X-Step-Up"]
        ? { ...makeContacts().household[0] }
        : { status: 403, body: { error: "step_up_required", reason: "Mapping needs a passkey." } },
    "POST /api/v1/step-up/challenge": () => ({ challenge: "abc" }),
    "POST /api/v1/step-up/verify": () => ({ proof: "proof-1", expires_at: "2026-10-28T12:00:00Z" }),
  });
  renderPage(<Contacts />);

  const [mapButton] = await screen.findAllByRole("button", { name: "Map accounts and calendars" });
  await userEvent.click(mapButton as HTMLElement);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await userEvent.click(await screen.findByRole("button", { name: "Use passkey" }));

  await waitFor(() =>
    expect(sent.filter((r) => r.method === "PUT").at(-1)?.headers["X-Step-Up"]).toBe("proof-1"),
  );
});
