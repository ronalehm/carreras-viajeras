import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../actions/rewards.actions", () => ({ cancelRedemptionAction: vi.fn(), claimReferralAction: vi.fn(), requestRedemptionAction: vi.fn() }));
import type { OwnReferrals, OwnRewards, RewardCatalogItem } from "../types/rewards.types";
import { RunnerRewardsView } from "./RunnerRewardsView";

const rewards: OwnRewards = { balance: 0, reviewRequired: false, activeRule: null, catalog: [], redemptions: [], ledger: [], benefits: [] };
const referrals: OwnReferrals = { code: null, counts: { pending: 0, credited: 0, reversed: 0 }, attribution: null };
const item: RewardCatalogItem = { id: "prize-1", catalogKey: "family-1", version: 1, title: "Descuento para viaje", description: "Una reserva pendiente sin pagos y sin otros descuentos.", kind: "discount", costStars: 60, discountUsd: 25, validFrom: "2026-10-29", validUntil: null, stock: 20, maxPerRunner: 1, redemptionDays: 30, active: true };
const rule = { id: "rule-id", version: 3, pointsPerReferral: 20, maxReferralsPerRunner: 5, validFrom: "2026-10-29", validUntil: null, terms: "Solo nuevas atribuciones de acuerdo con esta versión.", active: true };
afterEach(cleanup);
describe("RunnerRewardsView", () => {
  it("presents real empty state without advertising unconfigured gains", () => {
    render(<RunnerRewardsView rewards={rewards} referrals={referrals} />);
    expect(document.getElementById("beneficios")).toBeTruthy(); expect(document.getElementById("referidos")).toBeTruthy();
    expect(screen.getByText("No hay beneficios registrados en tus reservas.")).toBeTruthy();
    expect(screen.getByText("No hay premios vigentes disponibles.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Canjear estrellas" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aceptar código de referido" })).toBeNull();
    expect(screen.queryByText(/Próximamente/i)).toBeNull();
  });
  it("blocks new redemptions without an active rule even with an old catalog", () => {
    render(<RunnerRewardsView rewards={{ ...rewards, balance: 80, catalog: [item] }} referrals={referrals} />);
    expect((screen.getByRole("button", { name: "Canjear estrellas" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("El programa no está activo para nuevos canjes.")).toBeTruthy();
  });
  it("blocks canjes during review while preserving the actual negative balance", () => {
    render(<RunnerRewardsView rewards={{ ...rewards, balance: -15, reviewRequired: true, catalog: [item] }} referrals={referrals} />);
    expect(screen.getByText("-15 estrellas")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Canjear estrellas" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("ajuste pendiente");
  });
  it("shows real version conditions, separate referral counts and manual acceptance", () => {
    render(<RunnerRewardsView rewards={{ ...rewards, balance: 80, catalog: [item], activeRule: { id: "rule-id", version: 3, pointsPerReferral: 20, maxReferralsPerRunner: 5, validFrom: "2026-10-29", validUntil: null, terms: "Solo nuevas atribuciones de acuerdo con esta versión.", active: true } }} referrals={{ ...referrals, code: "opaque-safe-code", counts: { pending: 3, credited: 2, reversed: 1 } }} />);
    expect(screen.getByText(/Regla v3: 20 estrellas/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Acepto las condiciones/ })).toBeTruthy();
    expect(screen.getByText(/no te suscribe/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Canjear estrellas" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Tope del premio entre sus versiones: 20 unidades/)).toBeTruthy();
    expect(screen.queryByText(/20 unidades restantes/)).toBeNull();
  });
  it("keeps cancelled booking benefits visibly historical and prevents reassignment", () => {
    render(<RunnerRewardsView rewards={{ ...rewards, activeRule: rule, benefits: [{ id: "benefit-1", bookingId: "booking-1", bookingStatus: "cancelled", tripTitle: "Maratón del sur", title: "Traslado contratado", description: "Traslado según confirmación de la reserva.", kind: "contractual", discountUsd: null, createdAt: "2026-10-29T12:00:00Z" }] }} referrals={{ ...referrals, attribution: { status: "credited", rule: { ...rule, version: 1, pointsPerReferral: 10, terms: "Condiciones originales aceptadas." } } }} />);
    const benefit = screen.getByRole("heading", { name: "Traslado contratado" }).closest("article");
    expect(benefit).toBeTruthy(); expect(within(benefit!).getByText(/Reserva cancelada: registro histórico/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aceptar código de referido" })).toBeNull();
    expect(screen.getByText(/Tu atribución: Estrellas acreditadas/)).toBeTruthy();
    expect(screen.getByText(/Regla v1: 10 estrellas/)).toBeTruthy();
    expect(screen.getByText(/Regla v3: 20 estrellas/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Condiciones que aceptaste" })).toBeTruthy();
    expect(screen.getByText("Condiciones originales aceptadas.")).toBeTruthy();
  });
});
