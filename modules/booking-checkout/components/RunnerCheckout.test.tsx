// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: true, isSignedIn: true, user: { primaryEmailAddress: { verification: { status: "verified" } } } }) }));
import { RunnerCheckout } from "./RunnerCheckout";
import type { OfferView } from "@/modules/landing/utils/catalogOffer";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: "paid", amountUsd: 100, amountPenCents: 37500, checkoutUrl: null, balanceQuote: null }),
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("RunnerCheckout", () => {
  it("shows the balance converted from the balance amount, not the deposit", () => {
    const offer: OfferView = {
      totalPrice: "US$ 11,000", totalPricePen: "S/ 37,950.00", discount: null, discountPen: null,
      finalPrice: "US$ 11,000", finalPricePen: "S/ 37,950.00",
      deposits: [{ deposit: "US$ 300", depositPen: "S/ 1,035.00", balance: "US$ 10,700", balancePen: "S/ 36,915.00" }],
      balanceDueOn: null, bonus: null, validity: "Vigente", conditions: [], termsVersion: "santiago-2027-v1",
      exchangeRate: { rate: "3.4500", since: "30 de octubre de 2026" },
    };
    render(<RunnerCheckout tripId="trip" tripTitle="Maratón" campaignCode={null} offer={offer}
      returned={false} cancelled={false} bookingId={null} attemptId={null} />);
    expect(screen.getByText("Saldo: US$ 10,700 · S/ 36,915.00")).toBeTruthy();
  });

  it("shows the reason when the offer has no approved contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ code: "contract_unavailable", requestId: "req-123" }) }));
    const offer: OfferView = { totalPrice: "US$ 11,000", totalPricePen: "S/ 37,950.00", discount: null,
      discountPen: null, finalPrice: "US$ 11,000", finalPricePen: "S/ 37,950.00", deposits: [],
      balanceDueOn: null, bonus: null, validity: "Vigente", conditions: [], termsVersion: "santiago-2027-v1",
      exchangeRate: { rate: "3.4500", since: "30 de octubre de 2026" } };
    render(<RunnerCheckout tripId="trip" tripTitle="Maratón" campaignCode={null} offer={offer}
      returned={false} cancelled={false} bookingId={null} attemptId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Preparar reserva" }));
    const alert = (await screen.findByRole("alert")).textContent;
    expect(alert).toContain("No hay un contrato disponible o habilitado para pruebas para esta versión de la oferta.");
    expect(alert).toContain("Referencia: req-123");
  });

  it("resumes an active reservation returned by preparation", async () => {
    const prepared = {
      bookingId: "booking", tripTitle: "Maratón", offerVersion: 1, resumed: true,
      quote: { totalUsd: 11000, principalUsd: 300, balanceUsd: 10700, rateUsdPen: "3.4500", amountPenCents: 103500 },
      checkoutQuotes: { initial: { amountUsd: 300, amountPenCents: 103500, quoteHash: "a".repeat(64) }, balance: null },
      contract: { versionKey: "santiago-2027-v1", title: "Contrato", testDocument: true },
      documentSnapshot: "Documento único", documentHash: "b".repeat(64), expiresAt: "2026-10-30T20:00:00.000Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => prepared }));
    const offer: OfferView = { totalPrice: "US$ 11,000", totalPricePen: "S/ 37,950.00", discount: null,
      discountPen: null, finalPrice: "US$ 11,000", finalPricePen: "S/ 37,950.00", deposits: [],
      balanceDueOn: null, bonus: null, validity: "Vigente", conditions: [], termsVersion: "santiago-2027-v1",
      exchangeRate: { rate: "3.4500", since: "30 de octubre de 2026" } };
    render(<RunnerCheckout tripId="trip" tripTitle="Maratón" campaignCode={null} offer={offer}
      returned={false} cancelled={false} bookingId={null} attemptId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Preparar reserva" }));
    expect(await screen.findByText(/Retomamos tu reserva pendiente/)).toBeTruthy();
    expect(screen.getByText("Documento único")).toBeTruthy();
    expect(screen.getByText(/Documento de prueba/)).toBeTruthy();
  });

  it("makes card-only payment clear to the runner", () => {
    render(<RunnerCheckout tripId="trip" tripTitle="Maratón" campaignCode={null} offer={null}
      returned={false} cancelled={false} bookingId={null} attemptId={null} />);

    expect(screen.getByText(/Solo aceptamos tarjetas/)).toBeTruthy();
  });

  it("links a confirmed payment to the runner's reservations", async () => {
    render(<RunnerCheckout tripId="trip" tripTitle="Maratón" campaignCode={null} offer={null}
      returned bookingId="booking" attemptId="attempt" cancelled={false} />);

    expect((await screen.findByRole("link", { name: "Ver mi reserva" })).getAttribute("href")).toBe("/mis-carreras");
  });
});
