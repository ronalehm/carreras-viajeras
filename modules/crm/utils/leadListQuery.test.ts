import { describe, expect, it } from "vitest";
import { leadListHref, parseLeadListQuery } from "./leadListQuery";

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
