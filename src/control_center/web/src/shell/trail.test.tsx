/**
 * @file Back names the page you came from, skips in-page steps, and is absent after the navigation.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Page } from "../components/Page";
import { FROM_NAV, TrailProvider } from "./trail";

/** Live with a filter that adds a history entry, as the real page does. */
function Live() {
  const navigate = useNavigate();
  return (
    <Page title="Live">
      <button type="button" onClick={() => navigate("/live?show=running")}>
        Running
      </button>
    </Page>
  );
}

function app() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          element={
            <TrailProvider>
              <Link to="/live" state={FROM_NAV}>
                Nav Live
              </Link>
              <Outlet />
            </TrailProvider>
          }
        >
          <Route
            path="/"
            element={
              <Page title="Today">
                <Link to="/live">Live widget</Link>
              </Page>
            }
          />
          <Route path="/live" element={<Live />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Back", () => {
  it("returns to the page a widget was opened from, past in-page steps", () => {
    app();
    expect(screen.queryByRole("button", { name: /back to/i })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Live widget" }));
    fireEvent.click(screen.getByRole("button", { name: "Running" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to Today" }));
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
  });

  it("is absent on a page chosen in the navigation", () => {
    app();
    fireEvent.click(screen.getByRole("link", { name: "Nav Live" }));
    expect(screen.getByRole("heading", { name: "Live" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back to/i })).toBeNull();
  });
});
