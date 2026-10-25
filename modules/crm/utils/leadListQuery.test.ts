import { describe, expect, it } from "vitest";
import { isCanonicalLeadListQuery, leadListHref, parseLeadListQuery } from "./leadListQuery";

describe("parseLeadListQuery", () => {
  it("returns the defaults without filters", () => {
    expect(parseLeadListQuery({})).toEqual({ stage: undefined, owner: undefined, page: 1 });
  });

  it("maps mios to mine and keeps a member id", () => {
    expect(parseLeadListQuery({ etapa: "quoted", responsable: "mios", pagina: "2" })).toEqual({
      stage: "quoted",
      owner: "mine",
      page: 2,
    });
    expect(parseLeadListQuery({ responsable: "user-7" })).toMatchObject({ owner: "user-7" });
  });

  it("maps sin-asignar to unassigned", () => {
    expect(parseLeadListQuery({ responsable: "sin-asignar" })).toEqual({
      stage: undefined,
      owner: "unassigned",
      page: 1,
    });
  });

  it("ignores invalid and repeated values without throwing", () => {
    expect(
      parseLeadListQuery({ etapa: "foo", responsable: ["mios", "mios"], pagina: "-3", extra: "x" }),
    ).toEqual({ stage: undefined, owner: undefined, page: 1 });
    expect(parseLeadListQuery({ etapa: ["new", "new"], pagina: ["2", "3"] })).toEqual({
      stage: undefined,
      owner: undefined,
      page: 1,
    });
  });
});

describe("leadListHref", () => {
  it("returns the bare list without filters", () => {
    expect(leadListHref({ page: 1 }, 1)).toBe("/crm/leads");
  });

  it("includes stage, owner and page", () => {
    expect(leadListHref({ stage: "quoted", owner: "mine", page: 1 }, 2)).toBe(
      "/crm/leads?etapa=quoted&responsable=mios&pagina=2",
    );
    expect(leadListHref({ owner: "user-7", page: 1 }, 3)).toBe("/crm/leads?responsable=user-7&pagina=3");
  });

  it("writes unassigned back as sin-asignar and keeps it when changing page", () => {
    expect(leadListHref({ owner: "unassigned", page: 1 }, 1)).toBe("/crm/leads?responsable=sin-asignar");
    expect(leadListHref({ stage: "new", owner: "unassigned", page: 1 }, 2)).toBe(
      "/crm/leads?etapa=new&responsable=sin-asignar&pagina=2",
    );
  });

  it("omits page 1 and keeps the filters when changing page", () => {
    const filters = { stage: "new", owner: "mine", page: 2 } as const;
    expect(leadListHref(filters, 1)).toBe("/crm/leads?etapa=new&responsable=mios");
    expect(leadListHref(filters, 3)).toBe("/crm/leads?etapa=new&responsable=mios&pagina=3");
  });

  it.each([
    { stage: "lost", owner: "mine", page: 4 },
    { stage: "quoted", owner: "unassigned", page: 2 },
    { stage: undefined, owner: "user-7", page: 3 },
  ] as const)("round-trips $owner through parseLeadListQuery", (filters) => {
    const params = Object.fromEntries(
      new URL(leadListHref(filters, filters.page), "https://x.test").searchParams,
    );
    expect(parseLeadListQuery(params)).toEqual(filters);
  });
});

describe("isCanonicalLeadListQuery", () => {
  const canonical = (searchParams: Record<string, string | string[] | undefined>) =>
    isCanonicalLeadListQuery(searchParams, parseLeadListQuery(searchParams));

  it("accepts the empty query", () => {
    expect(canonical({})).toBe(true);
  });

  it("accepts the canonical query of each filter", () => {
    expect(canonical({ etapa: "quoted" })).toBe(true);
    expect(canonical({ responsable: "sin-asignar" })).toBe(true);
    expect(canonical({ etapa: "new", responsable: "mios", pagina: "2" })).toBe(true);
    expect(canonical({ responsable: "user-7", pagina: "3" })).toBe(true);
  });

  it("rejects the empty values sent by the GET filter form", () => {
    expect(canonical({ etapa: "", responsable: "" })).toBe(false);
    expect(canonical({ etapa: "", responsable: "mios" })).toBe(false);
  });

  it("rejects the default page", () => {
    expect(canonical({ pagina: "1" })).toBe(false);
    expect(canonical({ etapa: "new", pagina: "1" })).toBe(false);
  });

  it("rejects repeated values", () => {
    expect(canonical({ etapa: ["new", "new"] })).toBe(false);
    expect(canonical({ responsable: ["mios", "user-7"] })).toBe(false);
  });

  it("rejects the parameters in another order", () => {
    expect(canonical({ responsable: "mios", etapa: "new" })).toBe(false);
    expect(canonical({ pagina: "2", etapa: "new" })).toBe(false);
  });

  it("rejects unknown keys and invalid values", () => {
    expect(canonical({ extra: "x" })).toBe(false);
    expect(canonical({ etapa: "new", utm: "x" })).toBe(false);
    expect(canonical({ etapa: "foo" })).toBe(false);
  });

  it.each([
    {},
    { etapa: "", responsable: "" },
    { pagina: "1" },
    { etapa: ["new", "new"], responsable: "mios" },
    { responsable: "sin-asignar", etapa: "lost", pagina: "4" },
    { extra: "x", responsable: "user-7" },
  ])("redirects %o to a canonical URL in one step", (searchParams) => {
    const filters = parseLeadListQuery(searchParams);
    const params = Object.fromEntries(new URL(leadListHref(filters, filters.page), "https://x.test").searchParams);
    expect(parseLeadListQuery(params)).toEqual(filters);
    expect(canonical(params)).toBe(true);
  });
});
