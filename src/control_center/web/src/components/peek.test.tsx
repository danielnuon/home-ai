/**
 * @file A face opens its owner (spec 7.13): resting the pointer shows a card, and pressing and
 * holding fills a ring and then opens the sheet.
 */
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fakeServer, renderPage } from "../test/render";
import { Avatar } from "./Avatar";

const directory = {
  employees: [
    {
      name: "Atlas",
      title: "Chief of Staff",
      department: "personal",
      group: "Personal",
      state: "generating",
      now: "Writing the daily brief",
      tagline: "",
      model: "local-chat",
      tasks_done: 12,
    },
  ],
  proposals: [],
  instruments: 0,
};

beforeEach(() => {
  fakeServer({ "GET /api/v1/directory": () => directory });
});
afterEach(() => vi.useRealTimers());

test("resting the pointer on a face shows a card with who they are and what they are doing", async () => {
  renderPage(<Avatar department="personal" state="generating" name="Atlas" />);
  await userEvent.hover(screen.getByRole("img", { name: "Atlas, writing" }));

  const card = await screen.findByRole("tooltip");
  expect(await screen.findByText("Writing the daily brief")).toBeInTheDocument();
  expect(card).toHaveTextContent("Chief of Staff");
});

test("holding a face fills a ring, then opens the details in the sheet", async () => {
  vi.useFakeTimers();
  const { container } = renderPage(<Avatar department="personal" state="idle" name="Atlas" />);
  const face = screen.getByRole("img", { name: "Atlas, idle" });

  fireEvent.pointerDown(face, { button: 0, pointerType: "touch", clientX: 5, clientY: 5 });
  expect(container.querySelector(".avatar-hold-ring")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(600));
  vi.useRealTimers();

  expect(await screen.findByRole("dialog", { name: "Atlas" })).toBeInTheDocument();
  expect(await screen.findByText("Writing the daily brief")).toBeInTheDocument();
});

test("letting go before the ring closes cancels the hold", () => {
  vi.useFakeTimers();
  const { container } = renderPage(<Avatar department="personal" state="idle" name="Atlas" />);
  const face = screen.getByRole("img", { name: "Atlas, idle" });

  fireEvent.pointerDown(face, { button: 0, pointerType: "touch" });
  act(() => vi.advanceTimersByTime(200));
  fireEvent.pointerUp(face);
  act(() => vi.advanceTimersByTime(600));

  expect(container.querySelector(".avatar-hold-ring")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
