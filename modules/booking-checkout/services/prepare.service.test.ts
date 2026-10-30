// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/modules/trips", () => ({ getActiveOffer: vi.fn() }));
vi.mock("@/modules/contracts", () => ({ getCheckoutContractVersion: vi.fn() }));
vi.mock("./bookingCheckout.service", () => ({
  findResumableCheckoutBooking: vi.fn(), getCheckoutReservation: vi.fn(), enabledCheckoutMode: vi.fn(),
  persistCheckoutReservation: vi.fn(),
}));
vi.mock("./quote.service", async (importOriginal) => ({
  ...await importOriginal<typeof import("./quote.service")>(), getCurrentCheckoutRate: vi.fn(),
}));
import { getDb } from "@/lib/db";
import { getActiveOffer, type ActiveOffer } from "@/modules/trips";
import { getCheckoutContractVersion } from "@/modules/contracts";
import {
  enabledCheckoutMode, findResumableCheckoutBooking, getCheckoutReservation, persistCheckoutReservation,
} from "./bookingCheckout.service";
import { getCurrentCheckoutRate } from "./quote.service";
import { prepareBookingCheckout } from "./prepare.service";

const user = { id: "runner-1", email: "runner@example.invalid" };
const tripId = "11111111-1111-4111-8111-111111111111";
const bookingId = "22222222-2222-4222-8222-222222222222";
const rateId = "33333333-3333-4333-8333-333333333333";
const input = { tripId, paymentChoice: { kind: "full" as const }, requestId: "44444444-4444-4444-8444-444444444444" };
const contractBody = "Cuerpo del contrato aprobado, único en la respuesta de preparación.";
const contract = {
  id: "55555555-5555-4555-8555-555555555555", versionKey: "terms-v1", title: "Contrato", body: contractBody,
  status: "approved" as const, documentHash: "a".repeat(64), reviewHash: "a".repeat(64), approvedAt: new Date(),
};
const offer: ActiveOffer = {
  offerVersionId: "66666666-6666-4666-8666-666666666666", tripId, campaignId: null, version: 1, totalPriceUsd: 1000,
  discountUsd: 0, finalPriceUsd: 1000, depositOptionsUsd: [250], balanceDueOn: "2027-01-01", bonusDescription: null,
  validFrom: "2026-01-01", validUntil: null, capacityLimit: 5, termsVersion: "terms-v1", conditions: "Condiciones.",
  approvedAt: new Date(), activatedAt: new Date(),
};
const reservation = {
  id: bookingId, packageLabel: "Carrera", offerVersion: 1, termsVersion: "terms-v1", conditions: "Condiciones.",
  tripIncludes: ["Hotel"], tripExcludes: ["Vuelos"], expiresAt: new Date(Date.now() + 20 * 60 * 1000),
  quote: { totalUsd: 1000, principalUsd: 250, balanceUsd: 750, rateId, rateUsdPen: "3.7500", amountPenCents: 93750 },
  simulated: false,
};
const storedBooking = {
  id: bookingId, runnerUserId: user.id, packageLabel: "Carrera", offerVersion: 1, termsVersion: "terms-v1",
  conditions: "Condiciones.", tripIncludes: ["Hotel"], tripExcludes: ["Vuelos"], totalUsd: 1000, principalUsd: 250,
  rateId, rateUsdPen: "3.7500", amountPenCents: 93750, expiresAt: new Date(Date.now() + 20 * 60 * 1000),
};

function fakeDb(selects: unknown[][]) {
  const db = {
    select: vi.fn(() => {
      const result = selects.shift() ?? [];
      const query = {
        from: () => query, innerJoin: () => query, where: () => query, orderBy: () => query, limit: async () => result,
      };
      return query;
    }),
  };
  vi.mocked(getDb).mockReturnValue(db as never);
  return db;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(enabledCheckoutMode).mockReturnValue("live");
  vi.mocked(getCheckoutReservation).mockResolvedValue(null);
  vi.mocked(findResumableCheckoutBooking).mockResolvedValue(null);
  vi.mocked(getCheckoutContractVersion).mockResolvedValue(contract);
  vi.mocked(getActiveOffer).mockResolvedValue(offer);
  vi.mocked(getCurrentCheckoutRate).mockResolvedValue({ id: rateId, usdPen: "3.7500", effectiveFrom: new Date() });
});

describe("prepareBookingCheckout", () => {
  it("refuses to run while checkout is disabled", async () => {
    vi.mocked(enabledCheckoutMode).mockReturnValue(null);
    await expect(prepareBookingCheckout(input, user)).rejects.toThrow("checkout disabled");
    expect(getCheckoutReservation).not.toHaveBeenCalled();
  });

  it("resumes the runner's active booking instead of answering booking_exists", async () => {
    vi.mocked(findResumableCheckoutBooking).mockResolvedValue(bookingId);
    fakeDb([[storedBooking]]);
    const result = await prepareBookingCheckout({ ...input, paymentChoice: { kind: "deposit", index: 0 } }, user);
    expect(findResumableCheckoutBooking).toHaveBeenCalledWith(tripId, user.email, user.id, false);
    expect(result).toMatchObject({ bookingId, resumed: true, simulated: false, quote: { principalUsd: 250 } });
    expect(getActiveOffer).not.toHaveBeenCalled();
    expect(persistCheckoutReservation).not.toHaveBeenCalled();
  });

  it("returns booking_exists when the active booking is not this runner's", async () => {
    fakeDb([[{ leadId: "77777777-7777-4777-8777-777777777777", participantName: "Runner", tripTitle: "Carrera", includes: [], excludes: [] }]]);
    vi.mocked(persistCheckoutReservation).mockResolvedValue("booking_exists");
    await expect(prepareBookingCheckout(input, user)).resolves.toBe("booking_exists");
    // Looked up twice (before and after the insert race), always scoped to the session's user id.
    expect(findResumableCheckoutBooking).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(findResumableCheckoutBooking).mock.calls) expect(call).toEqual([tripId, user.email, user.id, false]);
  });

  it.each([["test", true], ["demo", true], ["live", false]] as const)(
    "in %s mode creates and resumes only bookings with simulated=%s",
    async (mode, simulated) => {
      vi.mocked(enabledCheckoutMode).mockReturnValue(mode);
      fakeDb([[{ leadId: "77777777-7777-4777-8777-777777777777", participantName: "Runner", tripTitle: "Carrera", includes: ["Hotel"], excludes: ["Vuelos"] }]]);
      vi.mocked(persistCheckoutReservation).mockResolvedValue({ ...reservation, simulated });
      const result = await prepareBookingCheckout(input, user);
      expect(getCheckoutReservation).toHaveBeenCalledWith(input.requestId, user.id, expect.any(String), simulated);
      expect(findResumableCheckoutBooking).toHaveBeenCalledWith(tripId, user.email, user.id, simulated);
      expect(persistCheckoutReservation).toHaveBeenCalledWith(expect.objectContaining({ simulated }));
      expect(result).toMatchObject({ simulated, resumed: false });
    },
  );

  it("answers invalid_payment_choice for a deposit the offer does not have", async () => {
    fakeDb([]);
    await expect(prepareBookingCheckout({ ...input, paymentChoice: { kind: "deposit", index: 2 } }, user))
      .resolves.toBe("invalid_payment_choice");
    expect(persistCheckoutReservation).not.toHaveBeenCalled();
  });

  it("returns one contract body and no rate id or contract fingerprint", async () => {
    fakeDb([[{ leadId: "77777777-7777-4777-8777-777777777777", participantName: "Runner", tripTitle: "Carrera", includes: ["Hotel"], excludes: ["Vuelos"] }]]);
    vi.mocked(persistCheckoutReservation).mockResolvedValue(reservation);
    const result = await prepareBookingCheckout(input, user);
    if (typeof result === "string") throw new Error("expected a prepared checkout, got " + result);
    expect(result.resumed).toBe(false);
    expect(result.contract).toEqual({ versionKey: "terms-v1", title: "Contrato", testDocument: false });
    expect(result.quote).not.toHaveProperty("rateId");
    const serialized = JSON.stringify(result);
    expect(serialized.split(contractBody)).toHaveLength(2);
    expect(serialized).not.toContain(rateId);
    expect(serialized).not.toContain(contract.documentHash);
  });
});
