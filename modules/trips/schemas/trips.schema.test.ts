// @vitest-environment node
import { describe, expect, it } from "vitest";
import { tripStatusEnum } from "@/lib/db-schema";
import {
  tripFormSchema,
  tripSlugSchema,
  tripStatusChangeSchema,
  tripStatusSchema,
  updateTripSchema,
} from "./trips.schema";

const TRIP_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";

// Strings as they come from Object.fromEntries(formData).
const validForm = {
  title: "  Maratón de Santiago 2027 ",
  slug: "maraton-santiago-2027",
  city: "Santiago",
  country: "Chile",
  raceDate: "2027-04-25",
  startDate: "2027-04-23",
  endDate: "2027-04-27",
  distances: "42K, 21K , ,10K",
  summary: "Viaje grupal para correr la Maratón de Santiago.",
  includes: "Hotel 4 noches\n\n  Traslados  \r\nKit de carrera\n",
  priceUsd: "1990",
  capacity: "100",
  imageUrl: "https://example.com/santiago.jpg",
};

const parse = (overrides: Record<string, string>) =>
  tripFormSchema.safeParse({ ...validForm, ...overrides });

const issueFields = (result: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  [...new Set(result.error?.issues.map((issue) => issue.path[0]))];

const expectErrorOn = (overrides: Record<string, string>, field: string) => {
  const result = parse(overrides);
  expect(result.success).toBe(false);
  expect(issueFields(result)).toEqual([field]);
};

describe("tripStatusSchema", () => {
  it("matches the trip_status database enum", () => {
    expect(tripStatusSchema.options).toEqual(tripStatusEnum.enumValues);
  });
});

describe("tripFormSchema", () => {
  it("parses a complete valid form into clean values", () => {
    const result = parse({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      title: "Maratón de Santiago 2027",
      slug: "maraton-santiago-2027",
      city: "Santiago",
      country: "Chile",
      raceDate: "2027-04-25",
      startDate: "2027-04-23",
      endDate: "2027-04-27",
      distances: ["42K", "21K", "10K"],
      summary: "Viaje grupal para correr la Maratón de Santiago.",
      includes: ["Hotel 4 noches", "Traslados", "Kit de carrera"],
      priceUsd: 1990,
      capacity: 100,
      imageUrl: "https://example.com/santiago.jpg",
    });
  });

  it("turns empty optional fields into null and an empty includes into []", () => {
    const result = parse({
      startDate: "",
      endDate: "  ",
      includes: "\n \n",
      priceUsd: "",
      capacity: "",
      imageUrl: "",
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      startDate: null,
      endDate: null,
      includes: [],
      priceUsd: null,
      capacity: null,
      imageUrl: null,
    });
  });

  it("drops extra keys such as status and priceCurrency", () => {
    const result = tripFormSchema.safeParse({
      ...validForm,
      status: "published",
      priceCurrency: "EUR",
      createdAt: "2020-01-01",
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("status");
    expect(result.data).not.toHaveProperty("priceCurrency");
    expect(result.data).not.toHaveProperty("createdAt");
  });

  describe("slug", () => {
    it("lowercases and trims it", () => {
      expect(parse({ slug: "  Maraton-Santiago-2027 " }).data?.slug).toBe("maraton-santiago-2027");
    });

    it.each(["maraton santiago", "maratón-santiago", "maraton--santiago", "-maraton", "maraton-", "ab", "a".repeat(81), ""])(
      "rejects %j",
      (slug) => {
        expectErrorOn({ slug }, "slug");
      },
    );

    it("uses the format message", () => {
      expect(tripSlugSchema.safeParse("Maraton Santiago").error?.issues[0]?.message).toBe(
        "Usa minúsculas, números y guiones (p. ej. maraton-santiago-2027).",
      );
    });
  });

  it.each([
    ["title", "ab"],
    ["title", "a".repeat(121)],
    ["city", "S"],
    ["country", " "],
    ["summary", "Corto"],
    ["summary", "a".repeat(301)],
  ])("rejects %s %j", (field, value) => {
    expectErrorOn({ [field]: value }, field);
  });

  it("rejects a missing required field on its own key", () => {
    const withoutTitle: Partial<typeof validForm> = { ...validForm };
    delete withoutTitle.title;
    const result = tripFormSchema.safeParse(withoutTitle);

    expect(issueFields(result)).toEqual(["title"]);
  });

  describe("distances", () => {
    it.each(["", " , ,", Array.from({ length: 11 }, (_, i) => `${i + 1}K`).join(","), "a".repeat(21)])(
      "rejects %j",
      (distances) => {
        expectErrorOn({ distances }, "distances");
      },
    );

    it("accepts 10 distances", () => {
      const distances = Array.from({ length: 10 }, (_, i) => `${i + 1}K`).join(",");
      expect(parse({ distances }).data?.distances).toHaveLength(10);
    });
  });

  describe("includes", () => {
    it("rejects 21 items", () => {
      expectErrorOn({ includes: Array.from({ length: 21 }, (_, i) => `Item ${i}`).join("\n") }, "includes");
    });

    it("rejects an item longer than 160 characters", () => {
      expectErrorOn({ includes: "a".repeat(161) }, "includes");
    });

    it("accepts 20 items", () => {
      const includes = Array.from({ length: 20 }, (_, i) => `Item ${i}`).join("\n");
      expect(parse({ includes }).data?.includes).toHaveLength(20);
    });
  });

  describe("priceUsd", () => {
    it.each(["-1", "12.5", "12,5", "abc", "1e3", "1000001"])("rejects %j", (priceUsd) => {
      expectErrorOn({ priceUsd }, "priceUsd");
    });

    it("uses the price message for decimals", () => {
      expect(parse({ priceUsd: "12.5" }).error?.issues[0]?.message).toBe(
        "Indica un precio en dólares, sin decimales.",
      );
    });

    it.each([
      ["0", 0],
      ["1000000", 1_000_000],
    ])("parses %j as %d", (priceUsd, expected) => {
      expect(parse({ priceUsd }).data?.priceUsd).toBe(expected);
    });
  });

  describe("capacity", () => {
    it.each(["0", "-5", "1.5", "10001", "cien"])("rejects %j", (capacity) => {
      expectErrorOn({ capacity }, "capacity");
    });

    it("accepts 1", () => {
      expect(parse({ capacity: "1" }).data?.capacity).toBe(1);
    });
  });

  describe("imageUrl", () => {
    it.each(["http://example.com/a.jpg", "https:example.com/a.jpg", "ftp://example.com/a.jpg", "no-es-url", `https://example.com/${"a".repeat(2040)}`])(
      "rejects %j",
      (imageUrl) => {
        expectErrorOn({ imageUrl }, "imageUrl");
      },
    );

    it("accepts an https URL", () => {
      expect(parse({ imageUrl: " https://cdn.example.com/a.jpg " }).data?.imageUrl).toBe(
        "https://cdn.example.com/a.jpg",
      );
    });
  });

  describe("dates", () => {
    it.each(["", "25/04/2027", "2027-02-30"])("rejects the race date %j", (raceDate) => {
      expectErrorOn({ raceDate }, "raceDate");
    });

    it("rejects an invalid travel date on its field", () => {
      expectErrorOn({ startDate: "2027-13-01" }, "startDate");
    });

    it("accepts a trip without travel dates", () => {
      expect(parse({ startDate: "", endDate: "" }).success).toBe(true);
    });

    it("asks for the end date when only the start date is set", () => {
      expectErrorOn({ endDate: "" }, "endDate");
    });

    it("asks for the start date when only the end date is set", () => {
      expectErrorOn({ startDate: "" }, "startDate");
    });

    it("rejects an end date before the start date on endDate", () => {
      expectErrorOn({ startDate: "2027-04-27", endDate: "2027-04-23" }, "endDate");
    });

    it.each(["2027-04-22", "2027-04-28"])("rejects the race date %s outside the trip", (raceDate) => {
      expectErrorOn({ raceDate }, "raceDate");
    });

    it("accepts a race on the first or last day of the trip", () => {
      expect(parse({ raceDate: "2027-04-23" }).success).toBe(true);
      expect(parse({ raceDate: "2027-04-27" }).success).toBe(true);
    });

    it("does not compare dates when a date field is already invalid", () => {
      expectErrorOn({ startDate: "abc" }, "startDate");
    });
  });
});

describe("updateTripSchema", () => {
  it("adds the trip id", () => {
    expect(updateTripSchema.safeParse({ ...validForm, id: TRIP_ID }).data?.id).toBe(TRIP_ID);
  });

  it("rejects an id that is not a UUID", () => {
    const result = updateTripSchema.safeParse({ ...validForm, id: "abc" });
    expect(issueFields(result)).toEqual(["id"]);
  });

  it("keeps the travel date rules", () => {
    const result = updateTripSchema.safeParse({ ...validForm, id: TRIP_ID, raceDate: "2027-05-01" });
    expect(issueFields(result)).toEqual(["raceDate"]);
  });
});

describe("tripStatusChangeSchema", () => {
  it("accepts a UUID and a known status", () => {
    expect(tripStatusChangeSchema.safeParse({ id: TRIP_ID, status: "published" }).data).toEqual({
      id: TRIP_ID,
      status: "published",
    });
  });

  it("rejects an id that is not a UUID", () => {
    const result = tripStatusChangeSchema.safeParse({ id: "abc", status: "draft" });
    expect(issueFields(result)).toEqual(["id"]);
  });

  it.each(["deleted", "PUBLISHED", ""])("rejects the status %j", (status) => {
    const result = tripStatusChangeSchema.safeParse({ id: TRIP_ID, status });
    expect(issueFields(result)).toEqual(["status"]);
  });
});
