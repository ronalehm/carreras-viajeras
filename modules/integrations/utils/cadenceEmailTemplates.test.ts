import { describe, expect, it } from "vitest";
import {
  cadenceEmailTemplate,
  formatCadenceDate,
  formatCadenceUsd,
  type CadenceEmailInput,
  type CadenceOffer,
  type CadenceStage,
  type CadenceStep,
} from "./cadenceEmailTemplates";
import { raceLabel } from "./lifecycleEmailTemplates";

const SIGNATURE = "\n\nEquipo de Carreras Viajeras";
const TRIP = "https://carrerasviajeras.example/viajes/maraton-de-lima";
const WA = "https://wa.me/51987654321";

const offer: CadenceOffer = {
  finalPriceUsd: 1499,
  depositOptionsUsd: [500, 300],
  balanceDueOn: "2027-03-15",
  bonusDescription: "Incluye polo oficial del equipo",
  validUntil: "2027-01-31",
};

const base: Omit<CadenceEmailInput, "stage" | "step"> = {
  fullName: "  Ana   María Pérez ",
  race: "Maratón de Lima",
  tripUrl: TRIP,
  whatsappUrl: WA,
  offer: null,
};

const build = (stage: CadenceStage, step: CadenceStep, extra: Partial<CadenceEmailInput> = {}) =>
  cadenceEmailTemplate({ ...base, stage, step, ...extra });

describe("cadenceEmailTemplate: reviewed texts", () => {
  it.each<[CadenceStage, CadenceStep, Partial<CadenceEmailInput>, string, string]>([
    [
      "new",
      "proposal",
      { offer },
      "Tu propuesta para Maratón de Lima",
      `Hola Ana, te compartimos la propuesta para correr Maratón de Lima con Carreras Viajeras. Precio final: US$1,499. Puedes separar tu cupo con US$300 y completar el saldo hasta el 15 de marzo de 2027. Incluye polo oficial del equipo. Esta oferta es válida hasta el 31 de enero de 2027. Mira todos los detalles en ${TRIP} o escríbenos por WhatsApp: ${WA}.`,
    ],
    [
      "new",
      "proposal",
      {},
      "Tu propuesta para Maratón de Lima",
      `Hola Ana, queremos ayudarte a correr Maratón de Lima. Mira qué incluye el viaje en ${TRIP} y escríbenos por WhatsApp para prepararte una propuesta a tu medida: ${WA}.`,
    ],
    [
      "new",
      "r3",
      {},
      "¿Pudiste revisar la propuesta para Maratón de Lima?",
      `Hola Ana, ¿pudiste revisar la propuesta? Si tienes dudas sobre el viaje, las fechas o la forma de pago, responde este correo o escríbenos por WhatsApp: ${WA}.`,
    ],
    [
      "new",
      "r5",
      {},
      "Lo que incluye tu viaje a Maratón de Lima",
      `Hola Ana, te recordamos que el viaje a Maratón de Lima incluye lo que ves en ${TRIP}. Si quieres, te llamamos o te escribimos por WhatsApp para resolver tus dudas: ${WA}.`,
    ],
    [
      "new",
      "r7",
      {},
      "¿Seguimos con Maratón de Lima?",
      "Hola Ana, no queremos insistir de más. Si todavía te interesa correr Maratón de Lima, responde este correo y retomamos. Si ahora no es buen momento, también nos ayuda saberlo.",
    ],
    [
      "contacted",
      "r3",
      {},
      "Sobre tu viaje a Maratón de Lima",
      `Hola Ana, gracias por conversar con nosotros. ¿Te quedó alguna duda sobre el viaje a Maratón de Lima? Responde este correo o escríbenos por WhatsApp: ${WA}.`,
    ],
    [
      "contacted",
      "r5",
      {},
      "¿Te preparamos tu cotización?",
      "Hola Ana, si quieres, preparamos tu cotización para Maratón de Lima con las opciones de pago disponibles. Solo responde este correo.",
    ],
    [
      "contacted",
      "r7",
      {},
      "¿Seguimos en contacto?",
      "Hola Ana, si todavía te interesa Maratón de Lima, aquí estamos para ayudarte. Si ahora no es buen momento, respóndenos y te escribimos más adelante.",
    ],
    [
      "quoted",
      "r3",
      {},
      "¿Revisaste tu cotización para Maratón de Lima?",
      `Hola Ana, ¿pudiste revisar tu cotización? Si quieres ajustar algo o tienes dudas sobre la separación del cupo, responde este correo o escríbenos por WhatsApp: ${WA}.`,
    ],
    [
      "quoted",
      "r5",
      {},
      "Separa tu cupo para Maratón de Lima",
      `Hola Ana, para asegurar tu lugar en Maratón de Lima puedes separar tu cupo. Te ayudamos con el proceso por WhatsApp: ${WA}.`,
    ],
    [
      "quoted",
      "r7",
      {},
      "Última consulta sobre Maratón de Lima",
      "Hola Ana, queremos saber si sigues interesado en Maratón de Lima. Responde este correo y te ayudamos con la reserva. Si decidiste no viajar esta vez, también nos ayuda saberlo.",
    ],
  ])("builds %s · %s %j", (stage, step, extra, subject, body) => {
    expect(build(stage, step, extra)).toEqual({ subject, body: body + SIGNATURE, templateVersion: 1 });
  });

  it("ignores the offer in the reminders", () => {
    expect(build("new", "r3", { offer })).toEqual(build("new", "r3"));
    expect(build("quoted", "r5", { offer })).toEqual(build("quoted", "r5"));
  });

  it.each<[CadenceStage, CadenceStep]>([
    ["contacted", "proposal"],
    ["quoted", "proposal"],
  ])("throws for a combination without template (%s · %s)", (stage, step) => {
    expect(() => build(stage, step)).toThrow(`No cadence template for ${stage}/${step}`);
  });

  it("throws for an unknown stage or step coming from untyped data", () => {
    expect(() => build("booked" as CadenceStage, "r3")).toThrow("No cadence template for booked/r3");
    expect(() => build("new", "r9" as CadenceStep)).toThrow("No cadence template for new/r9");
  });
});

describe("cadenceEmailTemplate: partial offer", () => {
  const proposal = (partial: Partial<CadenceOffer>) => build("new", "proposal", { offer: { ...offer, ...partial } }).body;

  it("omits the deposit and the balance without deposit options", () => {
    expect(proposal({ depositOptionsUsd: [], balanceDueOn: null })).toBe(
      `Hola Ana, te compartimos la propuesta para correr Maratón de Lima con Carreras Viajeras. Precio final: US$1,499. Incluye polo oficial del equipo. Esta oferta es válida hasta el 31 de enero de 2027. Mira todos los detalles en ${TRIP} o escríbenos por WhatsApp: ${WA}.${SIGNATURE}`,
    );
    // A stray balance date without deposits is not shown either.
    expect(proposal({ depositOptionsUsd: [] })).not.toContain("saldo");
  });

  it("keeps the deposit and drops only the balance fragment without a balance date", () => {
    expect(proposal({ balanceDueOn: null })).toContain(
      "Precio final: US$1,499. Puedes separar tu cupo con US$300. Incluye polo oficial del equipo.",
    );
  });

  it.each([null, "", "   "])("omits the bonus when it is %j", (bonusDescription) => {
    expect(proposal({ bonusDescription })).toContain(
      "hasta el 15 de marzo de 2027. Esta oferta es válida hasta el 31 de enero de 2027.",
    );
  });

  it("shows the bonus as written, ending in a period", () => {
    expect(proposal({ bonusDescription: " Incluye polo oficial. " })).toContain("2027. Incluye polo oficial. Esta oferta");
    expect(proposal({ bonusDescription: "¡Incluye polo!" })).toContain("2027. ¡Incluye polo! Esta oferta");
  });

  it("omits the validity without validUntil", () => {
    expect(proposal({ validUntil: null })).toBe(
      `Hola Ana, te compartimos la propuesta para correr Maratón de Lima con Carreras Viajeras. Precio final: US$1,499. Puedes separar tu cupo con US$300 y completar el saldo hasta el 15 de marzo de 2027. Incluye polo oficial del equipo. Mira todos los detalles en ${TRIP} o escríbenos por WhatsApp: ${WA}.${SIGNATURE}`,
    );
  });

  it("keeps only the price when every optional datum is missing", () => {
    expect(
      proposal({ depositOptionsUsd: [], balanceDueOn: null, bonusDescription: null, validUntil: null }),
    ).toBe(
      `Hola Ana, te compartimos la propuesta para correr Maratón de Lima con Carreras Viajeras. Precio final: US$1,499. Mira todos los detalles en ${TRIP} o escríbenos por WhatsApp: ${WA}.${SIGNATURE}`,
    );
  });

  it("uses the lowest deposit option and formats non-integer amounts with two decimals", () => {
    expect(proposal({ finalPriceUsd: 12345.5, depositOptionsUsd: [800, 250.25, 400] })).toContain(
      "Precio final: US$12,345.50. Puedes separar tu cupo con US$250.25 y completar",
    );
  });
});

describe("cadenceEmailTemplate: missing links", () => {
  const noTrip = { tripUrl: null };
  const noWa = { whatsappUrl: null };
  const none = { tripUrl: null, whatsappUrl: null };

  it("adapts the proposal with offer", () => {
    const tail = (extra: Partial<CadenceEmailInput>) =>
      build("new", "proposal", { offer, ...extra }).body.split("31 de enero de 2027.")[1];
    expect(tail(noTrip)).toBe(` Escríbenos por WhatsApp: ${WA}.${SIGNATURE}`);
    expect(tail(noWa)).toBe(` Mira todos los detalles en ${TRIP}.${SIGNATURE}`);
    expect(tail(none)).toBe(SIGNATURE);
  });

  it("adapts the proposal without offer", () => {
    const intro = "Hola Ana, queremos ayudarte a correr Maratón de Lima. ";
    expect(build("new", "proposal", noTrip).body).toBe(
      `${intro}Escríbenos por WhatsApp para prepararte una propuesta a tu medida: ${WA}.${SIGNATURE}`,
    );
    expect(build("new", "proposal", noWa).body).toBe(
      `${intro}Mira qué incluye el viaje en ${TRIP} y escríbenos para prepararte una propuesta a tu medida.${SIGNATURE}`,
    );
    expect(build("new", "proposal", none).body).toBe(
      `${intro}Escríbenos para prepararte una propuesta a tu medida.${SIGNATURE}`,
    );
  });

  it("adapts the reminders that mention WhatsApp", () => {
    expect(build("new", "r3", noWa).body).toBe(
      `Hola Ana, ¿pudiste revisar la propuesta? Si tienes dudas sobre el viaje, las fechas o la forma de pago, responde este correo.${SIGNATURE}`,
    );
    expect(build("contacted", "r3", noWa).body).toBe(
      `Hola Ana, gracias por conversar con nosotros. ¿Te quedó alguna duda sobre el viaje a Maratón de Lima? Responde este correo.${SIGNATURE}`,
    );
    expect(build("quoted", "r3", noWa).body).toBe(
      `Hola Ana, ¿pudiste revisar tu cotización? Si quieres ajustar algo o tienes dudas sobre la separación del cupo, responde este correo.${SIGNATURE}`,
    );
    expect(build("quoted", "r5", noWa).body).toBe(
      `Hola Ana, para asegurar tu lugar en Maratón de Lima puedes separar tu cupo. Te ayudamos con el proceso.${SIGNATURE}`,
    );
  });

  it("adapts new · r5 to a missing trip page and WhatsApp", () => {
    expect(build("new", "r5", noTrip).body).toBe(
      `Hola Ana, si quieres, te llamamos o te escribimos por WhatsApp para resolver tus dudas: ${WA}.${SIGNATURE}`,
    );
    expect(build("new", "r5", noWa).body).toBe(
      `Hola Ana, te recordamos que el viaje a Maratón de Lima incluye lo que ves en ${TRIP}. Si quieres, te llamamos o te escribimos para resolver tus dudas.${SIGNATURE}`,
    );
    expect(build("new", "r5", none).body).toBe(
      `Hola Ana, si quieres, te llamamos o te escribimos para resolver tus dudas.${SIGNATURE}`,
    );
  });

  it("treats blank links as missing and never leaves a placeholder", () => {
    expect(build("new", "r5", { tripUrl: "  ", whatsappUrl: "" })).toEqual(build("new", "r5", none));
    const steps: [CadenceStage, CadenceStep][] = [
      ["new", "proposal"],
      ["new", "r3"],
      ["new", "r5"],
      ["new", "r7"],
      ["contacted", "r3"],
      ["contacted", "r5"],
      ["contacted", "r7"],
      ["quoted", "r3"],
      ["quoted", "r5"],
      ["quoted", "r7"],
    ];
    for (const [stage, step] of steps) {
      for (const offerValue of [offer, null]) {
        const { body } = build(stage, step, { ...none, offer: offerValue });
        expect(body).not.toMatch(/WhatsApp|null|undefined|\{|:\s*\./);
        expect(body).not.toMatch(/ {2}|\s\./);
      }
    }
  });
});

describe("formatCadenceUsd", () => {
  it("groups thousands without decimals for whole amounts", () => {
    expect(formatCadenceUsd(1499)).toBe("US$1,499");
    expect(formatCadenceUsd(300)).toBe("US$300");
    expect(formatCadenceUsd(0)).toBe("US$0");
    expect(formatCadenceUsd(1000000)).toBe("US$1,000,000");
  });

  it("shows two decimals otherwise", () => {
    expect(formatCadenceUsd(1499.5)).toBe("US$1,499.50");
    expect(formatCadenceUsd(0.05)).toBe("US$0.05");
    expect(formatCadenceUsd(1234.567)).toBe("US$1,234.57");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects %s", (amount) => {
    expect(() => formatCadenceUsd(amount)).toThrow(RangeError);
  });
});

describe("formatCadenceDate", () => {
  it("formats a calendar date in Spanish", () => {
    expect(formatCadenceDate("2027-03-15")).toBe("15 de marzo de 2027");
    expect(formatCadenceDate("2027-01-01")).toBe("1 de enero de 2027");
    expect(formatCadenceDate("2026-12-31")).toBe("31 de diciembre de 2026");
    expect(formatCadenceDate("2027-09-05")).toBe("5 de septiembre de 2027");
  });

  it("does not depend on the process time zone", () => {
    const previous = process.env.TZ;
    try {
      for (const tz of ["America/Lima", "Pacific/Kiritimati", "Etc/GMT+12"]) {
        process.env.TZ = tz;
        expect(formatCadenceDate("2027-01-01")).toBe("1 de enero de 2027");
      }
    } finally {
      process.env.TZ = previous;
    }
  });

  it.each(["2027-13-01", "2027-00-10", "2027-03-32", "15/03/2027", "2027-3-5", ""])("rejects %j", (date) => {
    expect(() => formatCadenceDate(date)).toThrow(RangeError);
  });
});

describe("cadenceEmailTemplate: limits and subject", () => {
  it("normalizes the subject to a single line", () => {
    const race = " Maratón\r\nde\t  Lima \n";
    const email = build("new", "proposal", { race });
    expect(email.subject).toBe("Tu propuesta para Maratón de Lima");

    for (const [stage, step] of [
      ["new", "r3"],
      ["new", "r5"],
      ["new", "r7"],
      ["contacted", "r3"],
      ["quoted", "r3"],
      ["quoted", "r5"],
      ["quoted", "r7"],
    ] as [CadenceStage, CadenceStep][]) {
      const { subject } = build(stage, step, { race });
      expect(subject).not.toMatch(/[\r\n\t]|\s{2}/);
      expect(subject).toBe(subject.trim());
    }
  });

  it("uses the race fallback and the name fallback", () => {
    const email = build("contacted", "r3", { fullName: "   ", race: raceLabel({}) });
    expect(email.subject).toBe("Sobre tu viaje a tu próxima carrera");
    expect(email.body.startsWith("Hola viajero, gracias por conversar")).toBe(true);
  });

  it("keeps subject and body within the client_emails limits with very long data", () => {
    const race = "Ultra ".repeat(900).trim();
    const email = build("new", "proposal", {
      race,
      offer: { ...offer, bonusDescription: "Bono ".repeat(300).trim() },
    });
    expect(Array.from(email.subject)).toHaveLength(200);
    expect(email.subject.endsWith("…")).toBe(true);
    expect(Array.from(email.body).length).toBeLessThanOrEqual(4000);
    expect(email.body.endsWith(SIGNATURE)).toBe(true);
  });

  it("does not truncate a subject within the limit", () => {
    const race = "R".repeat(200 - "Tu propuesta para ".length);
    expect(build("new", "proposal", { race }).subject).toBe(`Tu propuesta para ${race}`);
  });
});
