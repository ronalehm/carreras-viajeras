import { describe, expect, it } from "vitest";
import { leadListHref, ownerToParam, parseLeadListQuery, stageToParam } from "./leadListQuery";

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
    expect(parseLeadListQuery({ responsable: "sin-asignar", etapa: "new" })).toEqual({
      stage: "new",
      owner: "unassigned",
      page: 1,
    });
  });

  it.each(["mine", "unassigned"])("treats the filter literal responsable=%s as no owner filter", (responsable) => {
    expect(parseLeadListQuery({ responsable })).toEqual({ stage: undefined, owner: undefined, page: 1 });
  });

  it.each([
    ["vencidos", "overdue"],
    ["pendientes", "pending"],
  ] as const)("maps seguimiento=%s to followUp %s", (seguimiento, followUp) => {
    expect(parseLeadListQuery({ responsable: "mios", seguimiento })).toEqual({
      stage: undefined,
      owner: "mine",
      followUp,
      page: 1,
    });
  });

  it.each([["overdue"], ["foo"], [""], [["pendientes", "pendientes"]]])(
    "treats an invalid seguimiento %j as no follow-up filter",
    (seguimiento) => {
      expect(parseLeadListQuery({ seguimiento })).toEqual({ page: 1 });
      expect(parseLeadListQuery({ seguimiento }).followUp).toBeUndefined();
    },
  );

  it("maps origen to the source filter, combined with the other filters", () => {
    expect(parseLeadListQuery({ origen: "instagram" })).toEqual({ source: "instagram", page: 1 });
    const query = { origen: "event", etapa: "quoted", responsable: "mios", seguimiento: "vencidos", pagina: "2" };
    expect(parseLeadListQuery(query)).toEqual({
      stage: "quoted",
      owner: "mine",
      followUp: "overdue",
      source: "event",
      page: 2,
    });
  });

  it.each([["foo"], [""], ["Instagram"], [["instagram", "instagram"]], [["instagram", "event"]]])(
    "treats an invalid or repeated origen %j as no source filter",
    (origen) => {
      expect(() => parseLeadListQuery({ origen })).not.toThrow();
      expect(parseLeadListQuery({ origen })).toEqual({ page: 1 });
      expect(parseLeadListQuery({ origen }).source).toBeUndefined();
    },
  );

  it("maps etapa=archivados to the archived stage filter", () => {
    expect(parseLeadListQuery({ etapa: "archivados", responsable: "mios" })).toEqual({
      stage: "archived",
      owner: "mine",
      page: 1,
    });
  });

  it("treats the filter literal etapa=archived as no stage filter", () => {
    expect(parseLeadListQuery({ etapa: "archived" })).toEqual({ stage: undefined, owner: undefined, page: 1 });
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

  it("maps unassigned to sin-asignar", () => {
    expect(leadListHref({ owner: "unassigned", page: 1 }, 1)).toBe("/crm/leads?responsable=sin-asignar");
  });

  it("omits page 1 and keeps the filters when changing page", () => {
    const filters = { stage: "new", owner: "mine", page: 2 } as const;
    expect(leadListHref(filters, 1)).toBe("/crm/leads?etapa=new&responsable=mios");
    expect(leadListHref(filters, 3)).toBe("/crm/leads?etapa=new&responsable=mios&pagina=3");
  });

  it("maps the follow-up filters to seguimiento and keeps them when changing page", () => {
    expect(leadListHref({ followUp: "overdue", page: 1 }, 1)).toBe("/crm/leads?seguimiento=vencidos");
    expect(leadListHref({ stage: "quoted", followUp: "pending", page: 1 }, 2)).toBe(
      "/crm/leads?etapa=quoted&seguimiento=pendientes&pagina=2",
    );
  });

  it("includes origen only with a source filter and keeps it when changing page or another filter", () => {
    expect(leadListHref({ page: 1 }, 2)).not.toContain("origen");
    expect(leadListHref({ source: "instagram", page: 1 }, 1)).toBe("/crm/leads?origen=instagram");
    expect(leadListHref({ source: "event", page: 1 }, 3)).toBe("/crm/leads?origen=event&pagina=3");
    expect(leadListHref({ stage: "quoted", owner: "mine", followUp: "pending", source: "event", page: 1 }, 2)).toBe(
      "/crm/leads?etapa=quoted&responsable=mios&seguimiento=pendientes&origen=event&pagina=2",
    );
    const filters = { stage: "new", source: "unknown", page: 1 } as const;
    expect(leadListHref({ ...filters, stage: "archived" }, 1)).toBe("/crm/leads?etapa=archivados&origen=unknown");
    expect(leadListHref({ ...filters, owner: "user-7" }, 1)).toBe(
      "/crm/leads?etapa=new&responsable=user-7&origen=unknown",
    );
  });

  it.each(["instagram", "web_form", "unknown"] as const)(
    "round-trips source %s through parseLeadListQuery",
    (source) => {
      const filters = { stage: "contacted", owner: "mine", followUp: "overdue", source, page: 2 } as const;
      const params = Object.fromEntries(new URL(leadListHref(filters, 2), "https://x.test").searchParams);
      expect(parseLeadListQuery(params)).toEqual(filters);
    },
  );

  it("builds the «Mis pendientes» preset of the CRM header", () => {
    expect(leadListHref({ owner: "mine", followUp: "pending", page: 1 }, 1)).toBe(
      "/crm/leads?responsable=mios&seguimiento=pendientes",
    );
  });

  it.each(["overdue", "pending"] as const)("round-trips followUp %s through parseLeadListQuery", (followUp) => {
    const filters = { stage: "new", owner: "unassigned", followUp, page: 2 } as const;
    const params = Object.fromEntries(new URL(leadListHref(filters, 2), "https://x.test").searchParams);
    expect(parseLeadListQuery(params)).toEqual(filters);
  });

  it("maps the archived stage filter to etapa=archivados and keeps it when changing page", () => {
    expect(leadListHref({ stage: "archived", page: 1 }, 1)).toBe("/crm/leads?etapa=archivados");
    expect(leadListHref({ stage: "archived", owner: "user-7", page: 1 }, 2)).toBe(
      "/crm/leads?etapa=archivados&responsable=user-7&pagina=2",
    );
  });

  it.each(["archived", "quoted"] as const)("round-trips stage %s through parseLeadListQuery", (stage) => {
    const filters = { stage, owner: "mine", page: 3 } as const;
    const params = Object.fromEntries(new URL(leadListHref(filters, 3), "https://x.test").searchParams);
    expect(parseLeadListQuery(params)).toEqual(filters);
  });

  it.each(["mine", "unassigned", "user-7"])("round-trips owner %s through parseLeadListQuery", (owner) => {
    const filters = { stage: "lost", owner, page: 4 } as const;
    const params = Object.fromEntries(new URL(leadListHref(filters, 4), "https://x.test").searchParams);
    expect(parseLeadListQuery(params)).toEqual(filters);
  });
});

describe("ownerToParam", () => {
  it("maps the owner keywords to their URL values and keeps a member id", () => {
    expect(ownerToParam("mine")).toBe("mios");
    expect(ownerToParam("unassigned")).toBe("sin-asignar");
    expect(ownerToParam("user-7")).toBe("user-7");
  });
});

describe("stageToParam", () => {
  it("maps the archived filter to archivados and keeps a lead stage", () => {
    expect(stageToParam("archived")).toBe("archivados");
    expect(stageToParam("lost")).toBe("lost");
  });
});
