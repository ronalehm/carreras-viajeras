// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  attributionParams,
  buildTripInquiryMessage,
  buildWhatsAppUrl,
  firstParam,
  GENERAL_INQUIRY_MESSAGE,
  registrationHref,
  resolveDestination,
  searchParamsToRecord,
  WHATSAPP_NUMBER,
} from "./inquiry";

describe("searchParamsToRecord", () => {
  it("da un string por clave con un valor y un array, en orden, por clave repetida", () => {
    expect(searchParamsToRecord(new URLSearchParams("c=abc&utm_source=x&utm_source=y&modo=stand"))).toEqual({
      c: "abc",
      utm_source: ["x", "y"],
      modo: "stand",
    });
  });

  it("conserva los valores vacíos y devuelve {} sin parámetros", () => {
    expect(searchParamsToRecord(new URLSearchParams("c="))).toEqual({ c: "" });
    expect(searchParamsToRecord(new URLSearchParams())).toEqual({});
  });

  it("mantiene la regla del primer valor de firstParam y attributionParams", () => {
    const record = searchParamsToRecord(new URLSearchParams("ref=amigo&ref=otro&c=a&c=b"));
    expect(firstParam(record.c)).toBe("a");
    expect(attributionParams(record)).toEqual({ c: "a", ref: "amigo" });
  });
});

describe("GENERAL_INQUIRY_MESSAGE", () => {
  it("es el texto fijo, sin datos personales", () => {
    expect(GENERAL_INQUIRY_MESSAGE).toBe(
      "Hola, quiero información para correr con Carreras Viajeras.",
    );
  });
});

describe("firstParam", () => {
  it("devuelve el string tal cual", () => {
    expect(firstParam("stand")).toBe("stand");
  });

  it("devuelve el primer valor de un array", () => {
    expect(firstParam(["stand", "otro"])).toBe("stand");
  });

  it.each([undefined, []])("devuelve undefined con %j", (value) => {
    expect(firstParam(value)).toBeUndefined();
  });
});

describe("attributionParams", () => {
  it("copia las cinco claves de atribución", () => {
    expect(
      attributionParams({
        c: "mml26",
        utm_source: "instagram",
        utm_medium: "social",
        utm_campaign: "preventa",
        ref: "club-lima",
      }),
    ).toEqual({
      c: "mml26",
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "preventa",
      ref: "club-lima",
    });
  });

  it("descarta cualquier otra clave", () => {
    expect(
      attributionParams({
        c: "mml26",
        modo: "stand",
        destino: "rio",
        source: "whatsapp",
        stage: "paid",
        channel: "event",
        campaignId: "00000000-0000-4000-8000-000000000000",
        price: "1",
        utm_term: "x",
      }),
    ).toEqual({ c: "mml26" });
  });

  it("usa el primer valor de un parámetro repetido", () => {
    expect(attributionParams({ c: ["mml26", "otra"], ref: ["club-lima"] })).toEqual({
      c: "mml26",
      ref: "club-lima",
    });
  });

  it("no normaliza: el servidor decide", () => {
    expect(attributionParams({ utm_source: " Instagram " })).toEqual({
      utm_source: " Instagram ",
    });
  });

  it.each([
    ["ausente", undefined],
    ["vacío", ""],
    ["solo espacios", "   "],
    ["array vacío", []],
    ["más de 200 caracteres", "a".repeat(201)],
  ])("descarta un valor %s", (_label, value) => {
    expect(attributionParams({ c: value, utm_source: value })).toEqual({});
  });

  it("acepta un valor de 200 caracteres", () => {
    const value = "a".repeat(200);
    expect(attributionParams({ ref: value })).toEqual({ ref: value });
  });

  it("devuelve un objeto vacío sin parámetros", () => {
    expect(attributionParams({})).toEqual({});
  });
});

describe("registrationHref", () => {
  it("añade los parámetros presentes codificados con URLSearchParams", () => {
    expect(registrationHref("maraton-santiago-2027", { c: "mml26", ref: "club lima" })).toBe(
      "/viajes/maraton-santiago-2027/registro?c=mml26&ref=club+lima",
    );
  });

  it("sin parámetros no añade `?`", () => {
    expect(registrationHref("maraton-santiago-2027", {})).toBe(
      "/viajes/maraton-santiago-2027/registro",
    );
  });

  it("sigue el orden de las claves de atribución", () => {
    expect(
      registrationHref("maraton-santiago-2027", {
        ref: "club-lima",
        utm_campaign: "preventa",
        utm_medium: "social",
        utm_source: "instagram",
        c: "mml26",
      }),
    ).toBe(
      "/viajes/maraton-santiago-2027/registro?c=mml26&utm_source=instagram&utm_medium=social&utm_campaign=preventa&ref=club-lima",
    );
  });

  it("codifica caracteres reservados", () => {
    expect(registrationHref("maraton-santiago-2027", { ref: "a&b=c?d#e" })).toBe(
      "/viajes/maraton-santiago-2027/registro?ref=a%26b%3Dc%3Fd%23e",
    );
  });

  it("compone con attributionParams", () => {
    expect(
      registrationHref(
        "maraton-santiago-2027",
        attributionParams({ c: "mml26", utm_source: "instagram", modo: "stand" }),
      ),
    ).toBe("/viajes/maraton-santiago-2027/registro?c=mml26&utm_source=instagram");
  });
});

describe("resolveDestination", () => {
  const allowed = ["maraton-santiago-2027", "maraton-lima-2027", "rio", "roma"];

  it.each(["maraton-lima-2027", "rio", "roma"])("acepta el valor permitido %s", (value) => {
    expect(resolveDestination(value, allowed)).toBe(value);
  });

  it("traduce el alias santiago-2027 al slug del catálogo", () => {
    expect(resolveDestination("santiago-2027", allowed)).toBe("maraton-santiago-2027");
  });

  it("no aplica el alias si Santiago no está publicado", () => {
    expect(resolveDestination("santiago-2027", ["rio", "roma"])).toBe("");
  });

  it.each([undefined, "", "xyz", "Rio", "maraton-santiago-2027 ", "constructor", "__proto__"])(
    "deja sin preselección con %j",
    (value) => {
      expect(resolveDestination(value, allowed)).toBe("");
    },
  );

  it("usa el primer valor de un array", () => {
    expect(resolveDestination(["roma", "rio"], allowed)).toBe("roma");
    expect(resolveDestination(["santiago-2027"], allowed)).toBe("maraton-santiago-2027");
    expect(resolveDestination([], allowed)).toBe("");
  });
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

  it("codifica el mensaje general", () => {
    expect(buildWhatsAppUrl(WHATSAPP_NUMBER, GENERAL_INQUIRY_MESSAGE)).toBe(
      `https://wa.me/51938127170?text=${encodeURIComponent(GENERAL_INQUIRY_MESSAGE)}`,
    );
  });

  it.each(["", "123456789", "1234567890123456"])("devuelve null con %j", (number) => {
    expect(buildWhatsAppUrl(number, "Hola")).toBeNull();
  });
});
