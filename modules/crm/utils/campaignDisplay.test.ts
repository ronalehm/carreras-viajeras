import { describe, expect, it } from "vitest";
import { campaignStatusEnum } from "@/lib/db-schema";
import { CAMPAIGN_STATUS_LABELS, campaignLinks, formatConversion } from "./campaignDisplay";

const ORIGIN = "https://carreras-viajeras.mentec.dev";

describe("campaignLinks", () => {
  it("builds the public registration link and the stand-mode link", () => {
    expect(campaignLinks(ORIGIN, "maraton-santiago-2027", "mml26")).toEqual({
      registration: "https://carreras-viajeras.mentec.dev/viajes/maraton-santiago-2027/registro?c=mml26",
      stand: "https://carreras-viajeras.mentec.dev/viajes/maraton-santiago-2027/registro?c=mml26&modo=stand",
    });
  });

  it("gives the same links when the origin has a trailing slash", () => {
    expect(campaignLinks(`${ORIGIN}/`, "maraton-santiago-2027", "mml26")).toEqual(
      campaignLinks(ORIGIN, "maraton-santiago-2027", "mml26"),
    );
  });

  it("keeps a code with hyphens as is", () => {
    expect(campaignLinks(ORIGIN, "maraton-santiago-2027", "qr-stand-mml-26").registration).toBe(
      "https://carreras-viajeras.mentec.dev/viajes/maraton-santiago-2027/registro?c=qr-stand-mml-26",
    );
  });

  it("works with the local development origin", () => {
    expect(campaignLinks("http://localhost:3000", "maraton-santiago-2027", "mml26").stand).toBe(
      "http://localhost:3000/viajes/maraton-santiago-2027/registro?c=mml26&modo=stand",
    );
  });
});

describe("CAMPAIGN_STATUS_LABELS", () => {
  it("labels every campaign status", () => {
    expect(CAMPAIGN_STATUS_LABELS).toEqual({ active: "Activa", closed: "Cerrada" });
    expect(Object.keys(CAMPAIGN_STATUS_LABELS)).toEqual([...campaignStatusEnum.enumValues]);
  });
});

describe("formatConversion", () => {
  it("shows a dash without visits", () => {
    expect(formatConversion(0, 0)).toBe("—");
    expect(formatConversion(3, 0)).toBe("—");
  });

  // es-PE in Node's ICU writes the percent sign right after the number, without a space.
  it("rounds to a whole percentage with the es-PE format", () => {
    expect(formatConversion(1, 3)).toBe("33%");
  });

  it("shows conversions above 100 % as they are", () => {
    expect(formatConversion(5, 4)).toBe("125%");
  });
});
