import { describe, expect, it } from "vitest";
import { campaignStatusEnum, leadChannelEnum } from "@/lib/db-schema";
import {
  campaignChannelSchema,
  campaignCodeSchema,
  campaignFormSchema,
  campaignIdSchema,
  campaignVisitSchema,
} from "./campaigns.schema";

const TRIP_ID = "6b0f8c1e-2a4d-4f3b-9c7e-1d2a3b4c5d6e";
const VALID = {
  code: " MML26 ",
  name: "QR stand MML",
  tripId: TRIP_ID,
  channel: "event",
  eventName: "",
};

const CODE_MESSAGE = "El código debe tener de 3 a 32 caracteres: minúsculas, números y guiones.";
const NAME_MESSAGE = "Escribe un nombre de 2 a 80 caracteres.";
const TRIP_MESSAGE = "Elige un viaje del catálogo.";
const CHANNEL_MESSAGE = "Elige el canal.";
const EVENT_MESSAGE = "El evento o stand debe tener entre 2 y 120 caracteres.";

function fieldErrors(input: Record<string, unknown>) {
  const result = campaignFormSchema.safeParse(input);
  if (result.success) throw new Error("expected the schema to fail");
  return Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

describe("campaignFormSchema", () => {
  it("normalizes the code to lowercase without spaces and a blank event to null", () => {
    expect(campaignFormSchema.parse(VALID)).toEqual({
      code: "mml26",
      name: "QR stand MML",
      tripId: TRIP_ID,
      channel: "event",
      eventName: null,
    });
  });

  it("trims the name and the event, and a missing event is null", () => {
    expect(
      campaignFormSchema.parse({ ...VALID, name: "  QR stand MML  ", eventName: "  Media Maratón de Lima 2026 " }),
    ).toMatchObject({ name: "QR stand MML", eventName: "Media Maratón de Lima 2026" });
    const withoutEvent: Partial<typeof VALID> = { ...VALID };
    delete withoutEvent.eventName;
    expect(campaignFormSchema.parse(withoutEvent).eventName).toBeNull();
  });

  it.each([
    ["mml-26-lima", "mml-26-lima"],
    ["abc", "abc"],
    ["a".repeat(32), "a".repeat(32)],
  ])("accepts the code %s", (code, expected) => {
    expect(campaignFormSchema.parse({ ...VALID, code }).code).toBe(expected);
  });

  it.each([
    ["a 2-character code", { code: "ab" }, "code", CODE_MESSAGE],
    ["a 33-character code", { code: "a".repeat(33) }, "code", CODE_MESSAGE],
    ["a code with a leading hyphen", { code: "-mml" }, "code", CODE_MESSAGE],
    ["a code with a trailing hyphen", { code: "mml-" }, "code", CODE_MESSAGE],
    ["a code with a double hyphen", { code: "mml--26" }, "code", CODE_MESSAGE],
    ["a code with inner spaces", { code: "mml 26" }, "code", CODE_MESSAGE],
    ["a code with other characters", { code: "mml_26" }, "code", CODE_MESSAGE],
    ["a 1-character name", { name: " A " }, "name", NAME_MESSAGE],
    ["an 81-character name", { name: "a".repeat(81) }, "name", NAME_MESSAGE],
    ["a tripId that is not a UUID", { tripId: "maraton-santiago-2027" }, "tripId", TRIP_MESSAGE],
    ["the unknown channel", { channel: "unknown" }, "channel", CHANNEL_MESSAGE],
    ["an unrecognized channel", { channel: "email" }, "channel", CHANNEL_MESSAGE],
    ["a 1-character event", { eventName: "a" }, "eventName", EVENT_MESSAGE],
    ["a 121-character event", { eventName: "a".repeat(121) }, "eventName", EVENT_MESSAGE],
  ])("rejects %s with an error on its field", (_case, override, field, message) => {
    expect(fieldErrors({ ...VALID, ...override })).toEqual({ [field]: message });
  });

  it("rejects missing fields with the Spanish messages, never zod's defaults", () => {
    expect(fieldErrors({})).toEqual({
      code: CODE_MESSAGE,
      name: NAME_MESSAGE,
      tripId: TRIP_MESSAGE,
      channel: CHANNEL_MESSAGE,
    });
  });

  it("drops status, createdBy, closedAt and any other extra key", () => {
    const parsed = campaignFormSchema.parse({
      ...VALID,
      status: "closed",
      createdBy: "staff-1",
      closedAt: "2026-10-29T00:00:00Z",
      closedBy: "staff-2",
    });
    expect(Object.keys(parsed).sort()).toEqual(["channel", "code", "eventName", "name", "tripId"]);
  });
});

describe("campaignCodeSchema", () => {
  it("is the same rule as campaigns_code_chk", () => {
    expect(campaignCodeSchema.safeParse(" Mml26 ").data).toBe("mml26");
    expect(campaignCodeSchema.safeParse("x y").success).toBe(false);
  });
});

describe("campaignChannelSchema", () => {
  it("offers every lead channel of the database except unknown", () => {
    const sorted = (values: readonly string[]) => [...values].sort();
    expect(sorted(campaignChannelSchema.options)).toEqual(
      sorted(leadChannelEnum.enumValues.filter((value) => value !== "unknown")),
    );
  });
});

describe("campaignIdSchema", () => {
  it("accepts a UUID and rejects anything else", () => {
    expect(campaignIdSchema.safeParse(TRIP_ID).success).toBe(true);
    expect(campaignIdSchema.safeParse("mml26").success).toBe(false);
  });
});

describe("campaignVisitSchema", () => {
  const VISIT = { slug: "maraton-santiago-2027", c: " MML26 " };

  it("keeps the slug and normalizes the code like ?c=", () => {
    expect(campaignVisitSchema.parse(VISIT)).toEqual({ slug: "maraton-santiago-2027", c: "mml26" });
  });

  it.each([
    ["abc", "abc"],
    ["80 characters", "a".repeat(80)],
  ])("accepts a slug of %s", (_case, slug) => {
    expect(campaignVisitSchema.safeParse({ ...VISIT, slug }).success).toBe(true);
  });

  it.each([
    ["with uppercase letters", "Maraton-Santiago-2027"],
    ["of 2 characters", "ab"],
    ["of 81 characters", "a".repeat(81)],
    ["with a double hyphen", "maraton--santiago"],
    ["with a leading hyphen", "-maraton"],
    ["with surrounding spaces", " maraton-santiago-2027 "],
    ["that is not a string", 2027],
  ])("rejects a slug %s", (_case, slug) => {
    expect(campaignVisitSchema.safeParse({ ...VISIT, slug }).success).toBe(false);
  });

  it.each([
    ["an invalid code", { c: "mml_26" }],
    ["a 2-character code", { c: "ab" }],
    ["a code that is not a string", { c: 26 }],
  ])("rejects %s", (_case, override) => {
    expect(campaignVisitSchema.safeParse({ ...VISIT, ...override }).success).toBe(false);
  });

  it("rejects a missing slug or code", () => {
    expect(campaignVisitSchema.safeParse({ slug: VISIT.slug }).success).toBe(false);
    expect(campaignVisitSchema.safeParse({ c: VISIT.c }).success).toBe(false);
  });

  it("rejects any extra key", () => {
    expect(campaignVisitSchema.safeParse({ ...VISIT, utm_source: "instagram" }).success).toBe(false);
    expect(campaignVisitSchema.safeParse({ ...VISIT, campaignId: "x" }).success).toBe(false);
  });
});

describe("campaign_status", () => {
  it("has the two values of CampaignStatus", () => {
    expect(campaignStatusEnum.enumValues).toEqual(["active", "closed"]);
  });
});
