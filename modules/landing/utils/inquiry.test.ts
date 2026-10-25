// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildInquiryMessage,
  buildTripInquiryMessage,
  buildWhatsAppUrl,
  parseDestinationId,
  WHATSAPP_NUMBER,
} from "./inquiry";

const contact = { name: "Ana", email: "ana@example.com", phone: "+51 999 888 777" };

describe("buildInquiryMessage", () => {
  it("devuelve la plantilla exacta con la cláusula de precios para Santiago", () => {
    expect(buildInquiryMessage({ ...contact, destination: "santiago-2027" })).toBe(
      "Hola, soy Ana. Me interesa Maratón de Santiago 42K 2027 y la preventa por corredor: US$1,499 al contado o US$1,799 en cuotas, con reserva anunciada de US$300. Quisiera conocer disponibilidad, inclusiones y condiciones finales.\n" +
        "Correo: ana@example.com\n" +
        "WhatsApp: +51 999 888 777\n" +
        "Entiendo que esta consulta no constituye reserva ni pago.",
    );
  });

  it.each([
    ["rio", "Río de Janeiro"],
    ["roma", "Roma"],
  ] as const)("%s usa su nombre y la cláusula sin precios", (destination, name) => {
    const message = buildInquiryMessage({ ...contact, destination });
    expect(message.split("\n")[0]).toBe(
      `Hola, soy Ana. Me interesa ${name} cuando haya una propuesta confirmada. Quisiera conocer disponibilidad, inclusiones y condiciones finales.`,
    );
    expect(message).not.toContain("US$");
  });

  it.each(["santiago-2027", "rio", "roma"] as const)(
    "%s incluye correo, WhatsApp y el aviso final",
    (destination) => {
      const lines = buildInquiryMessage({ ...contact, destination }).split("\n");
      expect(lines.slice(1)).toEqual([
        "Correo: ana@example.com",
        "WhatsApp: +51 999 888 777",
        "Entiendo que esta consulta no constituye reserva ni pago.",
      ]);
    },
  );
});

describe("buildTripInquiryMessage", () => {
  it("devuelve el texto exacto con título, fecha y lugar, sin precio", () => {
    const message = buildTripInquiryMessage({
      title: "Maratón de Lima 2027",
      raceDate: "16 de mayo de 2027",
      location: "Lima, Perú",
    });
    expect(message).toBe(
      "Hola, me interesa el viaje Maratón de Lima 2027 (16 de mayo de 2027, Lima, Perú). Quisiera conocer disponibilidad, inclusiones y condiciones finales.\n" +
        "Entiendo que esta consulta no constituye reserva ni pago.",
    );
    expect(message).not.toContain("US$");
  });
});

describe("buildWhatsAppUrl", () => {
  it("usa WHATSAPP_NUMBER", () => {
    expect(buildWhatsAppUrl(WHATSAPP_NUMBER, "Hola")).toBe(
      "https://wa.me/51938127170?text=Hola",
    );
  });

  it("normaliza un número con símbolos y espacios", () => {
    expect(buildWhatsAppUrl("+51 938 127 170", "Hola")).toBe(
      "https://wa.me/51938127170?text=Hola",
    );
  });

  it("codifica acentos y saltos de línea", () => {
    const text = "Me interesa Río de Janeiro\nCorreo: a@b.pe";
    const url = buildWhatsAppUrl(WHATSAPP_NUMBER, text);
    expect(url).toBe(`https://wa.me/51938127170?text=${encodeURIComponent(text)}`);
    expect(url).toContain("R%C3%ADo%20de%20Janeiro%0ACorreo");
  });

  it.each(["", "123456789", "1234567890123456"])("devuelve null con %j", (number) => {
    expect(buildWhatsAppUrl(number, "Hola")).toBeNull();
  });
});

describe("parseDestinationId", () => {
  it("acepta un id válido", () => {
    expect(parseDestinationId("rio")).toBe("rio");
  });

  it.each([undefined, "xyz", ["rio"]])("cae a santiago-2027 con %j", (value) => {
    expect(parseDestinationId(value)).toBe("santiago-2027");
  });
});
