// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
}));
vi.mock("@/lib/auth/permissions", () => ({ can: () => true }));
vi.mock("@/modules/accounts", () => ({ getCrmAccess: vi.fn() }));
vi.mock("@/modules/rewards", () => ({ BookingRewardsPanel: () => <div>Panel de recompensas</div> }));
vi.mock("@/components/shared/ConfirmActionButton", () => ({ ConfirmActionButton: ({ label }: { label: string }) => <button>{label}</button> }));
vi.mock("@/modules/trips", () => ({ formatTripPrice: (value: number) => `US$ ${value}` }));
vi.mock("@/modules/bookings", () => ({
  BookingForm: () => <form aria-label="Datos de la reserva" />,
  BookingStatusBadge: () => null,
  SimulatedBookingBadge: ({ simulated }: { simulated: boolean }) => (simulated ? <span>SIMULADA</span> : null),
  PaymentTable: () => <table aria-label="Pagos registrados" />,
  PaymentForm: () => <form aria-label="Registrar pago" />,
  changeBookingStatusAction: vi.fn(),
  getBookingById: vi.fn(),
  listBookingPayments: vi.fn(),
}));
import { getCrmAccess } from "@/modules/accounts";
import { getBookingById, listBookingPayments } from "@/modules/bookings";
import BookingPage from "./page";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const booking = (overrides: object) => ({
  id: BOOKING_ID, participantName: "Ana Runner", status: "pending", simulated: false, linked: true,
  trip: { title: "Maratón de Santiago" }, lead: null, priceLocked: false, ...overrides,
});
async function renderPage() {
  render(await BookingPage({ params: Promise.resolve({ id: BOOKING_ID }) } as PageProps<"/crm/reservas/[id]">));
}

beforeEach(() => {
  vi.mocked(getCrmAccess).mockResolvedValue({ status: "ok", user: { id: "staff", email: "s@example.invalid", emailVerified: true, staffRoles: ["admin"] } });
  vi.mocked(listBookingPayments).mockResolvedValue([]);
});
afterEach(cleanup);

describe("CRM booking page", () => {
  it("offers manual payments and rewards on a real booking", async () => {
    vi.mocked(getBookingById).mockResolvedValue(booking({}) as never);
    await renderPage();
    expect(screen.getByRole("form", { name: "Registrar pago" })).toBeTruthy();
    expect(screen.getByText("Panel de recompensas")).toBeTruthy();
    expect(screen.queryByText("Reserva simulada: sin pagos manuales ni recompensas.")).toBeNull();
  });

  it("hides the payment form and the rewards panel on a simulated booking, with a note", async () => {
    vi.mocked(getBookingById).mockResolvedValue(booking({ simulated: true }) as never);
    await renderPage();
    expect(screen.queryByRole("form", { name: "Registrar pago" })).toBeNull();
    expect(screen.queryByText("Panel de recompensas")).toBeNull();
    expect(screen.getByText("Reserva simulada: sin pagos manuales ni recompensas.")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Pagos registrados" })).toBeTruthy();
  });
});
