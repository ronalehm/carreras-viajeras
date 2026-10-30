// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: true, isSignedIn: true, user: { primaryEmailAddress: { verification: { status: "verified" } } } }) }));
import { RunnerCheckout } from "./RunnerCheckout";
import type { OfferView } from "@/modules/landing/utils/catalogOffer";

const offer: OfferView = {
  totalPrice: "US$ 11,000", totalPricePen: "S/ 37,950.00", discount: null, discountPen: null,
  finalPrice: "US$ 11,000", finalPricePen: "S/ 37,950.00",
  deposits: [{ deposit: "US$ 300", depositPen: "S/ 1,035.00", balance: "US$ 10,700", balancePen: "S/ 36,915.00" }],
  balanceDueOn: null, bonus: null, validity: "Vigente", conditions: [], termsVersion: "santiago-2027-v1",
  exchangeRate: { rate: "3.4500", since: "30 de octubre de 2026" },
};
const prepared = {
  bookingId: "booking", tripTitle: "Maratón", offerVersion: 1, resumed: false,
  quote: { totalUsd: 11000, principalUsd: 300, balanceUsd: 10700, rateUsdPen: "3.4500", amountPenCents: 103500 },
  checkoutQuotes: { initial: { amountUsd: 300, amountPenCents: 103500, quoteHash: "a".repeat(64) }, balance: null },
  contract: { versionKey: "santiago-2027-v1", title: "Contrato", testDocument: false },
  documentSnapshot: "Documento único", documentHash: "b".repeat(64), expiresAt: "2026-10-30T20:00:00.000Z",
  simulated: false,
};
const state = { status: "paid", amountUsd: 300, amountPenCents: 103500, checkoutUrl: null, balanceQuote: null, simulated: false };

function ok(body: unknown) { return { ok: true, json: async () => body }; }
function failure(code: string, requestId = "req-123") { return { ok: false, json: async () => ({ code, requestId }) }; }

function renderStart(simulated = false) {
  return render(<RunnerCheckout tripId="trip" tripTitle="Maratón" campaignCode={null} offer={offer}
    returned={false} cancelled={false} bookingId={null} attemptId={null} simulated={simulated} />);
}
function renderReturn(props: { cancelled?: boolean } = {}) {
  return render(<RunnerCheckout tripId="trip" tripTitle="Maratón" campaignCode="abc" offer={null}
    returned={!props.cancelled} cancelled={Boolean(props.cancelled)} bookingId="booking" attemptId="attempt" simulated={false} />);
}
async function prepareAndFailCheckout(code: string) {
  vi.mocked(fetch).mockResolvedValueOnce(ok(prepared) as Response)
    .mockResolvedValueOnce(ok({ accepted: true }) as Response)
    .mockResolvedValueOnce(failure(code) as Response);
  renderStart();
  fireEvent.click(screen.getByRole("button", { name: "Preparar reserva" }));
  fireEvent.click(await screen.findByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Continuar a pagar" }));
  return screen.findByRole("alert");
}

let assign: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(state)));
  assign = vi.fn();
  push.mockReset();
  vi.stubGlobal("location", { ...window.location, assign, reload: vi.fn(), pathname: "/viajes/maraton-santiago-2027/checkout" });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("RunnerCheckout", () => {
  it("shows the balance converted from the balance amount, not the deposit", () => {
    renderStart();
    expect(screen.getByText("Saldo: US$ 10,700 · S/ 36,915.00")).toBeTruthy();
  });

  it("uses production texts, never sandbox", () => {
    renderStart();
    expect(screen.queryByText(/sandbox/i)).toBeNull();
    expect(screen.getByText(/CHECKOUT$/)).toBeTruthy();
  });

  it("shows the reason and the reference when the offer has no contract", async () => {
    vi.mocked(fetch).mockResolvedValue(failure("contract_unavailable") as Response);
    renderStart();
    fireEvent.click(screen.getByRole("button", { name: "Preparar reserva" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("El contrato de esta oferta no está disponible en este momento.");
    expect(alert.textContent).toContain("Referencia: req-123");
    expect(within(alert).getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });

  it.each([
    ["registration_required", /Regístrate primero/, "Reintentar"],
    ["offer_unavailable", /La oferta ya no está disponible/, "Actualizar la página"],
    ["rate_unavailable", /No hay un tipo de cambio disponible/, "Reintentar"],
    ["sold_out", /alcanzó su cupo/, "Actualizar la página"],
    ["request_conflict", /otra solicitud de reserva/, "Reintentar"],
    ["invalid_payment_choice", /forma de pago elegida ya no está disponible/, "Elegir otra forma de pago"],
    ["internal", /error inesperado/, "Reintentar"],
    ["invalid_origin", /No pudimos validar la solicitud/, "Actualizar la página"],
    ["unknown_code", /No se pudo preparar la reserva/, "Reintentar"],
  ])("explains %s on preparation with an action and the reference", async (code, message, action) => {
    vi.mocked(fetch).mockResolvedValue(failure(code) as Response);
    renderStart();
    fireEvent.click(screen.getByRole("button", { name: "Preparar reserva" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(message);
    expect(alert.textContent).toContain("Referencia: req-123");
    expect(within(alert).getByRole("button", { name: action })).toBeTruthy();
  });

  it.each([
    ["booking_exists", /Ya existe una reserva/, "Ver mi reserva"],
    ["not_found", /No encontramos esta reserva/, "Ver mi reserva"],
    ["unauthorized", /Tu sesión terminó/, "Ir a mi cuenta"],
    ["forbidden", /Verifica tu correo/, "Ir a mi cuenta"],
  ])("links %s to where the runner can act", async (code, message, link) => {
    vi.mocked(fetch).mockResolvedValue(failure(code) as Response);
    renderStart();
    fireEvent.click(screen.getByRole("button", { name: "Preparar reserva" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(message);
    expect(alert.textContent).toContain("Referencia: req-123");
    expect(within(alert).getByRole("link", { name: link })).toBeTruthy();
  });

  it("retries the failed preparation with a new request id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(failure("rate_unavailable") as Response).mockResolvedValueOnce(ok(prepared) as Response);
    renderStart();
    fireEvent.click(screen.getByRole("button", { name: "Preparar reserva" }));
    fireEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Documento único")).toBeTruthy();
    const ids = vi.mocked(fetch).mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { requestId: string }).requestId);
    expect(new Set(ids).size).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["attempt_expired", /sesión de pago anterior venció/, "Iniciar el pago de nuevo"],
    ["stripe_unavailable", /No pudimos conectar con Stripe/, "Reintentar"],
    ["attempt_conflict", /otro intento de pago en curso/, "Reintentar"],
    ["reservation_expired", /La reserva venció/, "Iniciar de nuevo"],
    ["quote_changed", /El importe o el tipo de cambio cambió/, "Iniciar de nuevo"],
  ])("explains %s when opening Stripe, with an action and the reference", async (code, message, action) => {
    const alert = await prepareAndFailCheckout(code);
    expect(alert.textContent).toMatch(message);
    expect(alert.textContent).toContain("Referencia: req-123");
    expect(within(alert).getByRole("button", { name: action })).toBeTruthy();
  });

  it("asks to wait for confirmation while a payment is processing", async () => {
    const alert = await prepareAndFailCheckout("payment_processing");
    expect(alert.textContent).toMatch(/Espera su confirmación antes de intentar otro pago/);
    expect(alert.textContent).toContain("Referencia: req-123");
    expect(within(alert).getByRole("link", { name: "Ver mi reserva" }).getAttribute("href")).toBe("/mis-carreras");
  });

  it("opens a new Stripe session after attempt_expired", async () => {
    const alert = await prepareAndFailCheckout("attempt_expired");
    vi.mocked(fetch).mockResolvedValueOnce(ok({ accepted: true }) as Response)
      .mockResolvedValueOnce(ok({ checkoutUrl: "https://checkout.stripe.com/c/pay/new" }) as Response);
    fireEvent.click(within(alert).getByRole("button", { name: "Iniciar el pago de nuevo" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/new"));
  });

  it("goes back to choosing how to pay after reservation_expired", async () => {
    const alert = await prepareAndFailCheckout("reservation_expired");
    fireEvent.click(within(alert).getByRole("button", { name: "Iniciar de nuevo" }));
    expect(await screen.findByRole("button", { name: "Preparar reserva" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains a contract acceptance failure with its reference", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok(prepared) as Response).mockResolvedValueOnce(failure("document_changed", "req-doc") as Response);
    renderStart();
    fireEvent.click(screen.getByRole("button", { name: "Preparar reserva" }));
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continuar a pagar" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/El contrato cambió/);
    expect(alert.textContent).toContain("Referencia: req-doc");
    expect(within(alert).getByRole("button", { name: "Revisar el contrato vigente" })).toBeTruthy();
  });

  it("resumes an active reservation returned by preparation", async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ ...prepared, resumed: true, contract: { ...prepared.contract, testDocument: true } }) as Response);
    renderStart();
    fireEvent.click(screen.getByRole("button", { name: "Preparar reserva" }));
    expect(await screen.findByText(/Retomamos tu reserva pendiente/)).toBeTruthy();
    expect(screen.getByText("Documento único")).toBeTruthy();
    expect(screen.getByText(/Documento de prueba/)).toBeTruthy();
  });

  it("marks a simulated reservation as SIMULADA, with no real charge", async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ ...prepared, simulated: true }) as Response);
    renderStart();
    expect(screen.queryByText("SIMULADA")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preparar reserva" }));
    expect(await screen.findByText("SIMULADA")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("Pago de prueba: no se realiza ningún cargo real.");
  });

  it("marks a simulated mode as SIMULADA from the first step, before preparing", () => {
    renderStart(true);
    expect(screen.getByText("SIMULADA")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("Pago de prueba: no se realiza ningún cargo real.");
    expect(screen.getByRole("button", { name: "Preparar reserva" })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows no simulated badge for a real reservation", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(prepared) as Response);
    renderStart();
    fireEvent.click(screen.getByRole("button", { name: "Preparar reserva" }));
    await screen.findByText("Documento único");
    expect(screen.queryByText("SIMULADA")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("makes card-only payment clear to the runner", () => {
    render(<RunnerCheckout tripId="trip" tripTitle="Maratón" campaignCode={null} offer={null}
      returned={false} cancelled={false} bookingId={null} attemptId={null} simulated={false} />);

    expect(screen.getByText(/Solo aceptamos tarjetas/)).toBeTruthy();
  });
});

describe("RunnerCheckout after Stripe", () => {
  it("links a confirmed payment to the runner's reservations", async () => {
    renderReturn();
    expect(await screen.findByText(/Pago confirmado/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver mi reserva" }).getAttribute("href")).toBe("/mis-carreras");
  });

  it("marks a simulated return as SIMULADA", async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ ...state, simulated: true }) as Response);
    renderReturn();
    expect(await screen.findByText("SIMULADA")).toBeTruthy();
    expect(screen.getByText(/no se realiza ningún cargo real/)).toBeTruthy();
  });

  it("asks to wait while the payment is processing and can ask again", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok({ ...state, status: "created" }) as Response).mockResolvedValueOnce(ok(state) as Response);
    renderReturn();
    expect(await screen.findByText(/Procesando/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Consultar de nuevo" }));
    expect(await screen.findByText(/Pago confirmado/)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows a payment in review without offering another payment", async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ ...state, status: "needs_review" }) as Response);
    renderReturn();
    expect(await screen.findByText(/Pago en revisión/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver mi reserva" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pagar/ })).toBeNull();
  });

  it.each(["expired", "failed"])("lets the runner start again after a %s attempt, without contacting the team", async (status) => {
    vi.mocked(fetch).mockResolvedValue(ok({ ...state, status }) as Response);
    renderReturn();
    expect(await screen.findByRole("link", { name: "Ver mi reserva" })).toBeTruthy();
    expect(screen.queryByText(/Contacta al equipo/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar de nuevo" }));
    expect(push).toHaveBeenCalledWith("/viajes/maraton-santiago-2027/checkout?c=abc");
  });

  it("offers to go back to Stripe after cancelling there", async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ ...state, status: "created", checkoutUrl: "https://checkout.stripe.com/c/pay/open" }) as Response);
    renderReturn({ cancelled: true });
    expect(await screen.findByText(/No completaste el pago/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Volver al pago en Stripe" }).getAttribute("href")).toBe("https://checkout.stripe.com/c/pay/open");
  });

  it("explains a failed state lookup with its reference and where to sign in", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(failure("unauthorized", "req-state") as Response).mockResolvedValueOnce(ok(state) as Response);
    renderReturn();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Tu sesión terminó/);
    expect(alert.textContent).toContain("Referencia: req-state");
    expect(within(alert).getByRole("link", { name: "Ir a mi cuenta" }).getAttribute("href")).toBe("/cuenta");
  });

  it("retries a state lookup that failed without a known code", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(failure("internal", "req-500") as Response).mockResolvedValueOnce(ok(state) as Response);
    renderReturn();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Referencia: req-500");
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText(/Pago confirmado/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains a failed balance payment with its reference", async () => {
    const balanceQuote = { amountUsd: 10700, amountPenCents: 3691500, quoteHash: "c".repeat(64) };
    vi.mocked(fetch).mockResolvedValueOnce(ok({ ...state, balanceQuote }) as Response).mockResolvedValueOnce(failure("balance_not_due") as Response);
    renderReturn();
    fireEvent.click(await screen.findByRole("button", { name: "Pagar saldo" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no tiene un saldo pendiente/);
    expect(alert.textContent).toContain("Referencia: req-123");
  });
});
