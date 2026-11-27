/**
 * @file Chat shows each lead as a contact circle with their live state (spec 7.2, Chat).
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import type { ChatLead, ChatThread } from "../api/types";
import { fakeServer, renderPage } from "../test/render";
import Chat from "./Chat";

const ATLAS: ChatLead = {
  id: "atlas",
  name: "Atlas",
  title: "Chief of Staff",
  department: "personal",
  state: "generating",
  now: "Writing the brief",
};

const SPARK: ChatLead = {
  id: "spark",
  name: "Spark",
  title: "Ideation Lead",
  department: "ideation",
  state: "blocked",
  now: "",
};

const LEADS = [ATLAS, SPARK];

const thread = (lead: ChatLead): ChatThread => ({ lead, leads: LEADS, messages: [] });

test("each lead is a contact circle with what they are doing", async () => {
  fakeServer({
    "GET /api/v1/chat/atlas": () => thread(ATLAS),
    "GET /api/v1/chat/spark": () => thread(SPARK),
  });
  renderPage(<Chat />);

  const atlas = await screen.findByRole("button", { name: /Atlas/ });
  expect(atlas).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByText("Writing the brief").length).toBeGreaterThan(0);
  // With nothing to say, the circle falls back to the state in words.
  expect(screen.getByRole("button", { name: /Spark/ })).toHaveTextContent("blocked");

  await userEvent.click(screen.getByRole("button", { name: /Spark/ }));
  expect(await screen.findByRole("region", { name: "Chat with Spark" })).toBeInTheDocument();
});
