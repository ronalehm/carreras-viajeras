// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn(async () => ({ id: "staff-1" })) }));

import { failure, runBookingAction } from "./runBookingAction";

describe("runBookingAction", () => {
  const schema = z.object({ bookingId: z.string() });
  const data = new FormData();
  data.set("bookingId", "b-1");

  it("keeps the default texts without overrides", async () => {
    const { state } = await runBookingAction(data, schema, async () => failure("not_found"));
    expect(state).toMatchObject({ code: "not_found", message: "La reserva ya no existe o está cancelada. Recarga la página." });
  });

  it("replaces the texts of the errors mutate returns, field errors included", async () => {
    const { state } = await runBookingAction(data, schema, async (_input, values) => failure("duplicate", values),
      { duplicate: "Otro texto.", not_found: "No encontrada." });
    expect(state).toEqual({
      status: "error", code: "duplicate", message: "Otro texto.",
      values: { bookingId: "b-1" }, fieldErrors: { participantEmail: ["Otro texto."] },
    });
  });
});
