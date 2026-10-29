import { describe, expect, it } from "vitest";
import { normalizeCampaignCode, normalizeReferral, normalizeUtm, reRegistrationNote } from "./leadAttribution";

describe("normalizeCampaignCode", () => {
  it.each([
    [" MML26 ", "mml26"],
    ["mml-26-lima", "mml-26-lima"],
    ["abc", "abc"],
    ["a".repeat(32), "a".repeat(32)],
  ])("normalizes %j to %j", (value, expected) => {
    expect(normalizeCampaignCode(value)).toBe(expected);
  });

  it.each([
    ["a 2-character code", "ab"],
    ["inner spaces", "x y"],
    ["200 characters", "a".repeat(200)],
    ["33 characters", "a".repeat(33)],
    ["a leading hyphen", "-mml"],
    ["a trailing hyphen", "mml-"],
    ["a double hyphen", "mml--26"],
    ["other characters", "mml_26"],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
  ])("returns null for %s", (_case, value) => {
    expect(normalizeCampaignCode(value)).toBeNull();
  });
});

describe("normalizeUtm", () => {
  it.each([
    ["Instagram", "instagram"],
    ["  Social  ", "social"],
    ["pre.venta~2027+lima-1_b", "pre.venta~2027+lima-1_b"],
    ["a", "a"],
    ["a".repeat(100), "a".repeat(100)],
  ])("normalizes %j to %j", (value, expected) => {
    expect(normalizeUtm(value)).toBe(expected);
  });

  it.each([
    ["markup", "<script>"],
    ["an empty string", ""],
    ["only spaces", "   "],
    ["101 characters", "a".repeat(101)],
    ["inner spaces", "pre venta"],
    ["accents", "promoción"],
    ["null", null],
    ["undefined", undefined],
  ])("returns null for %s", (_case, value) => {
    expect(normalizeUtm(value)).toBeNull();
  });
});

describe("normalizeReferral", () => {
  it.each([
    ["Club-Lima", "club-lima"],
    [" Runners.PE ", "runners.pe"],
    ["ab", "ab"],
    ["a".repeat(60), "a".repeat(60)],
  ])("normalizes %j to %j", (value, expected) => {
    expect(normalizeReferral(value)).toBe(expected);
  });

  it.each([
    ["1 character", "a"],
    ["61 characters", "a".repeat(61)],
    ["inner spaces", "club lima"],
    ["markup", "<b>club</b>"],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
  ])("returns null for %s", (_case, value) => {
    expect(normalizeReferral(value)).toBeNull();
  });
});

describe("reRegistrationNote", () => {
  const EMPTY = {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    referredBy: null,
    consentVersion: "registro-web-pendiente-pl",
    marketingOptIn: false,
  };

  it("joins every part with a value with ' · '", () => {
    expect(
      reRegistrationNote({
        utmSource: "instagram",
        utmMedium: "social",
        utmCampaign: "preventa",
        referredBy: "club-lima",
        consentVersion: "registro-web-v1",
        marketingOptIn: true,
      }),
    ).toBe("UTM: instagram / social / preventa · Ref: club-lima · Texto legal registro-web-v1 · Promociones: sí");
  });

  it("keeps only the legal version and the promotions choice without attribution", () => {
    expect(reRegistrationNote(EMPTY)).toBe("Texto legal registro-web-pendiente-pl · Promociones: no");
  });

  it("leaves out the UTM part without UTM values and joins only the present ones", () => {
    expect(reRegistrationNote({ ...EMPTY, referredBy: "club-lima", marketingOptIn: true })).toBe(
      "Ref: club-lima · Texto legal registro-web-pendiente-pl · Promociones: sí",
    );
    expect(reRegistrationNote({ ...EMPTY, utmSource: "tiktok", utmCampaign: "preventa" })).toBe(
      "UTM: tiktok / preventa · Texto legal registro-web-pendiente-pl · Promociones: no",
    );
  });
});
