/**
 * @file The shared interaction patterns: the "…" menu, swipe rows, hold to confirm, ambient time
 * and the shortcut list. Each gesture also has a visible way in (spec 7.15, principle 5).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Check, Trash2 } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { ambientAt } from "../design/Ambient";
import { SHORTCUTS } from "../shell/Help";
import { ActionRow } from "./ActionRow";
import { HoldButton } from "./HoldButton";

afterEach(() => vi.useRealTimers());

function row(onRestore = vi.fn(), onDelete = vi.fn()) {
  const restore = { label: "Restore", icon: Check, onSelect: onRestore };
  render(
    <MemoryRouter>
      <ActionRow
        title="Unit A lease"
        meta="Rental"
        start={restore}
        more={[
          restore,
          { label: "Delete for good", icon: Trash2, destructive: true, onSelect: onDelete },
        ]}
      />
    </MemoryRouter>,
  );
  return { onRestore, onDelete };
}

test("the … button opens a menu whose items run and close it", async () => {
  const { onDelete } = row();
  await userEvent.click(screen.getByRole("button", { name: "More actions for Unit A lease" }));

  const menu = screen.getByRole("menu", { name: "Actions for Unit A lease" });
  expect(menu).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Restore" })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitem", { name: "Delete for good" })).toHaveFocus();
  await userEvent.keyboard("{Enter}");

  expect(onDelete).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("right-clicking the row opens the same menu, and Escape closes it", async () => {
  row();
  fireEvent.contextMenu(screen.getByText("Unit A lease"));

  expect(screen.getByRole("menu")).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("pressing and holding on a touch screen opens the menu", () => {
  vi.useFakeTimers();
  row();
  fireEvent.pointerDown(screen.getByText("Unit A lease"), { pointerType: "touch", button: 0 });
  act(() => vi.advanceTimersByTime(600));

  expect(screen.getByRole("menu")).toBeInTheDocument();
  // The hold swallows the click that follows it; send that click so the next test starts clean.
  fireEvent.click(document.body);
});

test("the swipe's main action is also a labelled button on the row", async () => {
  const { onRestore } = row();
  await userEvent.click(screen.getByRole("button", { name: "Restore" }));

  expect(onRestore).toHaveBeenCalledOnce();
});

test("hold to confirm runs only after the full hold", () => {
  vi.useFakeTimers();
  const onConfirm = vi.fn();
  render(<HoldButton label="Delete forever" onConfirm={onConfirm} />);
  const button = screen.getByRole("button", { name: /Hold to delete forever/ });
  expect(button).toHaveTextContent("Hold to delete forever · can't be undone");

  fireEvent.pointerDown(button);
  act(() => vi.advanceTimersByTime(600));
  fireEvent.pointerUp(button);
  act(() => vi.advanceTimersByTime(1200));
  expect(onConfirm).not.toHaveBeenCalled();

  fireEvent.keyDown(button, { key: " " });
  act(() => vi.advanceTimersByTime(1200));
  expect(onConfirm).toHaveBeenCalledOnce();
});

test("ambient time is a cool dawn in the morning and a warm dusk in the evening", () => {
  expect(ambientAt(7)).toEqual({ dawn: 1, dusk: 0 });
  expect(ambientAt(18.5)).toEqual({ dawn: 0, dusk: 1 });
  expect(ambientAt(13)).toEqual({ dawn: 0, dusk: 0 });
});

test("every shortcut in the help list has words, so none is the only way", () => {
  expect(SHORTCUTS.map(([keys]) => keys)).toEqual(["/", ".", "?", "Tab", "Enter", "Esc", "↑ ↓"]);
  SHORTCUTS.forEach(([, does]) => expect(does.length).toBeGreaterThan(5));
});
