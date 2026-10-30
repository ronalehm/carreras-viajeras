import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// @/modules/trips also re-exports server code (services, actions); only the real formatter is needed.
vi.mock("@/modules/trips", () => import("@/modules/trips/utils/tripDisplay"));

import type { RunnerBookingSummary } from "../types/bookings.types";
import { RaceSelector } from "./RaceSelector";

afterEach(cleanup);

const trip = { title: "Santiago 2027", city: "Santiago", country: "Chile", raceDate: "2027-05-16", startDate: null, endDate: null, includes: [] };
const bookings: RunnerBookingSummary[] = [
  { id: "real", status: "confirmed", simulated: false, trip },
  { id: "demo", status: "pending", simulated: true, trip: { ...trip, title: "Santiago 2027 (demo)" } },
];

describe("RaceSelector", () => {
  it("marks only the simulated booking as SIMULADA", () => {
    render(<RaceSelector bookings={bookings} selectedId="real" today="2026-10-30" />);
    const [real, demo] = screen.getAllByRole("link");
    expect(real.getAttribute("href")).toBe("/mis-carreras?reserva=real");
    expect(within(real).queryByText("SIMULADA")).toBeNull();
    expect(demo.getAttribute("href")).toBe("/mis-carreras?reserva=demo");
    expect(within(demo).getByText("SIMULADA")).toBeTruthy();
  });

  it("renders nothing for a single booking", () => {
    const { container } = render(<RaceSelector bookings={[bookings[1]]} selectedId="demo" today="2026-10-30" />);
    expect(container.innerHTML).toBe("");
  });
});
