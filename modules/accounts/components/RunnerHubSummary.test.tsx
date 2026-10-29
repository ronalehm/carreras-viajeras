import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/modules/bookings", () => ({
  BOOKING_STATUS_LABELS: { pending: "Pendiente", confirmed: "Confirmada", cancelled: "Cancelada" },
}));
import { RunnerHubSummary } from "./RunnerHubSummary";
import type { RunnerBookingSummary } from "@/modules/bookings";

afterEach(cleanup);

const trip = { title: "Santiago 2027", city: "Santiago", country: "Chile", raceDate: "2027-05-16", startDate: null, endDate: null, includes: [] };

describe("RunnerHubSummary", () => {
  it("shows a read failure rather than claiming that no races exist", () => {
    render(<RunnerHubSummary state={{ status: "error" }} />);
    expect(screen.getByText(/No pudimos cargar tus carreras/)).toBeTruthy();
    expect(screen.queryByText("Aún no tienes carreras registradas.")).toBeNull();
    expect(screen.getByRole("link", { name: "Reintentar" }).getAttribute("href")).toBe("/cuenta/perfil#mis-carreras");
  });

  it("shows the real empty state with a working destination", () => {
    render(<RunnerHubSummary state={{ status: "ok", today: "2026-10-29", bookings: [] }} />);
    expect(screen.getByText("Aún no tienes carreras registradas.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explorar experiencias" }).getAttribute("href")).toBe("/#destinos");
  });

  it("links each own race to its canonical detail and keeps cancelled distinct from finished", () => {
    const bookings: RunnerBookingSummary[] = [
      { id: "own-1", status: "confirmed", trip },
      { id: "own-2", status: "cancelled", trip: { ...trip, title: "Lima 2025", raceDate: "2025-10-12" } },
    ];
    render(<RunnerHubSummary state={{ status: "ok", today: "2026-10-29", bookings }} />);
    expect(screen.getByRole("link", { name: "Ver mi reserva: Santiago 2027" }).getAttribute("href")).toBe("/mis-carreras?reserva=own-1");
    expect(screen.getByText("Confirmada")).toBeTruthy();
    expect(screen.getByText("Cancelada")).toBeTruthy();
    expect(screen.queryByText("Viaje terminado")).toBeNull();
  });
});
