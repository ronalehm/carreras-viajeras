import { describe, expect, it } from "vitest";
import { leadListHref, ownerToParam, parseLeadListQuery, stageToParam } from "./leadListQuery";

describe("parseLeadListQuery", () => {
  it("preserves list view through filters and pagination, omitting the default board view", () => {
    const filters = parseLeadListQuery({ vista: "lista", responsable: "mios", etapa: "quoted" });
    expect(filters.view).toBe("list");
    expect(leadListHref(filters, 2)).toBe("/crm/leads?etapa=quoted&responsable=mios&vista=lista&pagina=2");
    expect(parseLeadListQuery({ vista: ["lista", "lista"] }).view).toBeUndefined();
    expect(parseLeadListQuery({ vista: "foo" }).view).toBeUndefined();
  });
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

describe("parseLeadListQuery: origen", () => {
  it("maps origen to the channel filter", () => {
    expect(parseLeadListQuery({ origen: "event", etapa: "quoted" })).toEqual({
      stage: "quoted",
      channel: "event",
      page: 1,
    });
  });

  it.each([["foo"], ["Event"], [""], [["event", "event"]], [["event", "instagram"]]])(
    "treats origen=%j as no origin filter",
    (origen) => {
      expect(parseLeadListQuery({ origen, responsable: "mios" })).toEqual({ owner: "mine", page: 1 });
      expect(parseLeadListQuery({ origen }).channel).toBeUndefined();
    },
  );
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

describe("leadListHref: origen", () => {
  it("writes the channel value as origen", () => {
    expect(leadListHref({ channel: "whatsapp_status", page: 1 }, 1)).toBe("/crm/leads?origen=whatsapp_status");
  });

  it("keeps origen when changing page and stage (funnel)", () => {
    const filters = { stage: "new", owner: "mine", channel: "event", page: 1 } as const;
    expect(leadListHref(filters, 2)).toBe("/crm/leads?etapa=new&responsable=mios&origen=event&pagina=2");
    expect(leadListHref({ ...filters, stage: "lost" }, 1)).toBe(
      "/crm/leads?etapa=lost&responsable=mios&origen=event",
    );
  });

  it.each(["event", "unknown", "google_ads"] as const)("round-trips channel %s through parseLeadListQuery", (channel) => {
    const filters = { stage: "quoted", followUp: "overdue", channel, page: 2 } as const;
    const params = Object.fromEntries(new URL(leadListHref(filters, 2), "https://x.test").searchParams);
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
