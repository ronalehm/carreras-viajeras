import { describe, expect, it } from "vitest";
import { z } from "zod";
import { leadActivityTypeEnum, leadSourceEnum, leadStageEnum } from "@/lib/db-schema";
import {
  createLeadSchema,
  leadActivityFormSchema,
  leadActivityTypeSchema,
  leadIdSchema,
  leadListQuerySchema,
  leadOwnerChangeSchema,
  leadSourceChangeSchema,
  leadSourceSchema,
  leadStageChangeSchema,
  leadStageSchema,
  manualLeadSourceSchema,
  nextActionSchema,
  phoneSchema,
  sourceDetailSchema,
  updateLeadSchema,
} from "./leads.schema";

const TRIP_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";
const LEAD_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";

// Strings as Object.fromEntries(formData) delivers them: blanks are "", the checkbox is "on".
const validForm = {
  fullName: "  Ana Pérez ",
  phone: "+51 938-127 170",
  email: " Ana.Perez@Example.COM ",
  location: "",
  tripId: "",
  destinationText: "",
  source: "whatsapp",
  ownerUserId: "user-1",
  note: "",
  consent: "on",
};

function fieldErrors(input: Record<string, unknown>, schema: z.ZodType = createLeadSchema) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected a validation error");
  return z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
}

const SOURCES_IN_UI_ORDER = [
  "event",
  "partner",
  "referral",
  "whatsapp",
  "whatsapp_status",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "google_ads",
  "luma",
  "web_form",
  "other",
  "unknown",
];

describe("lead enums", () => {
  it("match the database enums", () => {
    expect(leadStageSchema.options).toEqual(leadStageEnum.enumValues);
    expect(leadActivityTypeSchema.options).toEqual(leadActivityTypeEnum.enumValues);
  });

  it("include the automation and source_changed activity types", () => {
    for (const type of ["automation", "source_changed"]) {
      expect(leadActivityTypeSchema.options).toContain(type);
      expect(leadActivityTypeEnum.enumValues).toContain(type);
    }
  });
});

describe("lead sources", () => {
  it("lists the 14 sources in the order of Requirement 1", () => {
    expect(leadSourceSchema.options).toEqual(SOURCES_IN_UI_ORDER);
  });

  it("has the same set of values as the database enum (its order may differ)", () => {
    expect(leadSourceEnum.enumValues).toHaveLength(leadSourceSchema.options.length);
    expect(new Set(leadSourceSchema.options)).toEqual(new Set(leadSourceEnum.enumValues));
  });

  it("offers every source but web_form for manual use, in the same order", () => {
    expect(manualLeadSourceSchema.options).toEqual(SOURCES_IN_UI_ORDER.filter((source) => source !== "web_form"));
    expect(manualLeadSourceSchema.options).toHaveLength(13);
  });

  it.each([["web_form"], [""], ["whatsapp_business"], [undefined]])("rejects the manual source %j", (source) => {
    const result = manualLeadSourceSchema.safeParse(source);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Elige el origen del lead.");
  });
});

describe("sourceDetailSchema", () => {
  it.each([
    ["missing", undefined, null],
    ["empty", "", null],
    ["blank", "   ", null],
    ["2 characters", " 5K ", "5K"],
    ["120 characters", "a".repeat(120), "a".repeat(120)],
    ["a name", "  Maratón de Lima 2026 ", "Maratón de Lima 2026"],
  ])("normalizes a %s detail", (_, input, expected) => {
    expect(sourceDetailSchema.parse(input)).toBe(expected);
  });

  it.each([
    ["1 character", " a "],
    ["121 characters", "a".repeat(121)],
  ])("rejects a detail of %s without repeating it", (_, input) => {
    const result = sourceDetailSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "El detalle debe tener entre 2 y 120 caracteres.",
    ]);
    expect(JSON.stringify(result.error?.issues.map((issue) => issue.message))).not.toContain("aaa");
  });
});

describe("phoneSchema", () => {
  it("normalizes to E.164 and rejects a number without country code", () => {
    expect(phoneSchema.parse("+51 938-127 170")).toBe("+51938127170");
    expect(phoneSchema.parse("+56 (9) 1234.5678")).toBe("+56912345678");
    const result = phoneSchema.safeParse("938 127 170");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Escribe el número con código de país, p. ej. +51 938 127 170.");
  });
});

describe("createLeadSchema", () => {
  it("normalizes a valid form and drops unknown keys", () => {
    const result = createLeadSchema.parse({
      ...validForm,
      stage: "paid",
      createdBy: "attacker",
      consentVersion: "forged",
    });

    expect(result).toEqual({
      fullName: "Ana Pérez",
      phone: "+51938127170",
      email: "ana.perez@example.com",
      location: null,
      tripId: null,
      destinationText: null,
      source: "whatsapp",
      sourceDetail: null,
      ownerUserId: "user-1",
      note: null,
      consent: "on",
    });
    expect(result).not.toHaveProperty("stage");
    expect(result).not.toHaveProperty("createdBy");
    expect(result).not.toHaveProperty("consentVersion");
  });

  it("keeps the optional fields when filled", () => {
    const result = createLeadSchema.parse({
      ...validForm,
      phone: "+56 (9) 1234.5678",
      email: "",
      location: " Lima, Perú ",
      tripId: TRIP_ID,
      destinationText: " Panamá ",
      source: "other",
      note: " Quiere la 21K. ",
    });

    expect(result).toMatchObject({
      phone: "+56912345678",
      email: null,
      location: "Lima, Perú",
      tripId: TRIP_ID,
      destinationText: "Panamá",
      source: "other",
      note: "Quiere la 21K.",
    });
  });

  it("turns missing optional keys into null without errors", () => {
    const optionalKeys = ["email", "location", "tripId", "destinationText", "sourceDetail", "note"];
    const required = Object.fromEntries(Object.entries(validForm).filter(([key]) => !optionalKeys.includes(key)));
    const result = createLeadSchema.safeParse(required);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      email: null,
      location: null,
      tripId: null,
      destinationText: null,
      sourceDetail: null,
      note: null,
    });
  });

  it.each([
    ["without country code", "938 127 170"],
    ["with letters", "+51 938 abc 170"],
    ["with 7 digits", "+5193812"],
    ["with 16 digits", "+5193812717012345"],
    ["starting with +0", "+0938127170"],
  ])("rejects a phone %s", (_, phone) => {
    expect(fieldErrors({ ...validForm, phone }).phone).toEqual([
      "Escribe el número con código de país, p. ej. +51 938 127 170.",
    ]);
  });

  it("rejects a 1-character name", () => {
    expect(fieldErrors({ ...validForm, fullName: " A " }).fullName).toEqual([
      "El nombre debe tener entre 2 y 120 caracteres.",
    ]);
  });

  it("rejects an invalid email", () => {
    expect(fieldErrors({ ...validForm, email: "ana@" }).email).toEqual(["Introduce un correo válido."]);
  });

  it("rejects a tripId that is not a UUID", () => {
    expect(fieldErrors({ ...validForm, tripId: "maraton-santiago-2027" }).tripId).toEqual([
      "Elige un viaje del catálogo.",
    ]);
  });

  it("rejects the web_form source in the manual form", () => {
    expect(fieldErrors({ ...validForm, source: "web_form" }).source).toEqual(["Elige el origen del lead."]);
  });

  it.each([["missing", undefined], ["empty (no default)", ""]])("requires the source: %s", (_, source) => {
    expect(fieldErrors({ ...validForm, source }).source).toEqual(["Elige el origen del lead."]);
  });

  it("accepts unknown and keeps a trimmed source detail", () => {
    expect(createLeadSchema.parse({ ...validForm, source: "unknown", sourceDetail: "  Maratón de Lima 2026 " })).toMatchObject({
      source: "unknown",
      sourceDetail: "Maratón de Lima 2026",
    });
  });

  it.each(["a", "a".repeat(121)])("rejects a source detail of %#: outside 2–120 characters, on its field", (sourceDetail) => {
    expect(fieldErrors({ ...validForm, source: "event", sourceDetail })).toEqual({
      sourceDetail: ["El detalle debe tener entre 2 y 120 caracteres."],
    });
  });

  it.each([
    ["missing", undefined],
    ["not checked", "off"],
  ])("rejects consent %s", (_, consent) => {
    expect(fieldErrors({ ...validForm, consent }).consent).toEqual([
      "Confirma que el contacto aceptó que guardemos sus datos.",
    ]);
  });

  it("rejects an empty owner and texts over their limits", () => {
    const errors = fieldErrors({
      ...validForm,
      ownerUserId: "",
      location: "x".repeat(81),
      destinationText: "x".repeat(121),
      note: "x".repeat(2001),
    });
    expect(Object.keys(errors).sort()).toEqual(["destinationText", "location", "note", "ownerUserId"]);
  });

  it("never echoes the input in its messages", () => {
    const secret = "+51 SECRETO";
    const result = createLeadSchema.safeParse({ ...validForm, phone: secret, fullName: "Z" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).not.toContain("SECRETO");
  });
});

describe("leadListQuerySchema", () => {
  it("parses valid values", () => {
    expect(leadListQuerySchema.parse({ etapa: "quoted", responsable: "mios", pagina: "3" })).toEqual({
      etapa: "quoted",
      responsable: "mios",
      pagina: 3,
    });
  });

  it("falls back to the defaults on invalid values or arrays", () => {
    expect(
      leadListQuerySchema.parse({ etapa: "foo", responsable: ["mios", "user-1"], pagina: ["1", "2"] }),
    ).toEqual({ etapa: undefined, responsable: undefined, pagina: 1 });
    expect(leadListQuerySchema.parse({ etapa: ["new", "lost"], responsable: "" })).toEqual({
      etapa: undefined,
      responsable: undefined,
      pagina: 1,
    });
  });

  it.each(["0", "-3", "abc", "1.5", "1001", ""])("turns pagina=%j into 1", (pagina) => {
    expect(leadListQuerySchema.parse({ pagina }).pagina).toBe(1);
  });

  it("accepts the last page (1000)", () => {
    expect(leadListQuerySchema.parse({ pagina: "1000" }).pagina).toBe(1000);
  });

  it.each(["vencidos", "pendientes"])("parses seguimiento=%s", (seguimiento) => {
    expect(leadListQuerySchema.parse({ seguimiento }).seguimiento).toBe(seguimiento);
  });

  it.each([["foo"], ["overdue"], ["pending"], [""], [["vencidos", "vencidos"]]])(
    "treats an invalid seguimiento %j as no filter",
    (seguimiento) => {
      expect(leadListQuerySchema.parse({ seguimiento, etapa: "new" })).toEqual({
        etapa: "new",
        responsable: undefined,
        seguimiento: undefined,
        pagina: 1,
      });
    },
  );
});

describe("leadListQuerySchema: origen", () => {
  it.each(SOURCES_IN_UI_ORDER)("parses origen=%s", (origen) => {
    expect(leadListQuerySchema.parse({ origen }).origen).toBe(origen);
  });

  it.each([["foo"], ["Instagram"], [""], [["instagram", "instagram"]], [["instagram", "event"]]])(
    "treats an invalid or repeated origen %j as no filter",
    (origen) => {
      expect(leadListQuerySchema.parse({ origen, etapa: "new" })).toEqual({ etapa: "new", origen: undefined, pagina: 1 });
    },
  );
});

describe("leadListQuerySchema: archivados", () => {
  it("accepts etapa=archivados (archived leads)", () => {
    expect(leadListQuerySchema.parse({ etapa: "archivados", responsable: "mios" })).toEqual({
      etapa: "archivados",
      responsable: "mios",
      seguimiento: undefined,
      pagina: 1,
    });
  });

  it.each([["archived"], ["Archivados"], [["archivados", "archivados"]]])(
    "treats etapa=%j as no stage filter",
    (etapa) => {
      expect(leadListQuerySchema.parse({ etapa }).etapa).toBeUndefined();
    },
  );
});

describe("leadIdSchema", () => {
  it("keeps only the lead id", () => {
    expect(leadIdSchema.parse({ leadId: LEAD_ID, archivedBy: "intruder", stage: "paid" })).toEqual({
      leadId: LEAD_ID,
    });
  });

  it.each([[{ leadId: "abc" }], [{}]])("rejects %j with «El lead no es válido.»", (input) => {
    expect(fieldErrors(input, leadIdSchema).leadId).toEqual(["El lead no es válido."]);
  });
});

describe("updateLeadSchema", () => {
  const validEdit = {
    leadId: LEAD_ID,
    fullName: " Ana Pérez ",
    phone: "+51 938 127 170",
    email: "",
    location: " Lima ",
    tripId: TRIP_ID,
    destinationText: "",
  };

  it("normalizes the contact fields and drops every other key", () => {
    const result = updateLeadSchema.parse({
      ...validEdit,
      stage: "paid",
      source: "web_form",
      ownerUserId: "intruder",
      actorUserId: "intruder",
      consent: "on",
    });
    expect(result).toEqual({
      leadId: LEAD_ID,
      fullName: "Ana Pérez",
      phone: "+51938127170",
      email: null,
      location: "Lima",
      tripId: TRIP_ID,
      destinationText: null,
    });
  });

  it.each([["missing", undefined], ["not a UUID", "abc"]])("rejects a leadId %s", (_, leadId) => {
    expect(fieldErrors({ ...validEdit, leadId }, updateLeadSchema).leadId).toEqual(["El lead no es válido."]);
  });

  it("rejects an invalid email with the same message as the manual form", () => {
    expect(fieldErrors({ ...validEdit, email: "ana@" }, updateLeadSchema).email).toEqual([
      "Introduce un correo válido.",
    ]);
  });
});

describe("leadStageChangeSchema", () => {
  it("requires a lost reason for lost", () => {
    for (const lostReason of [undefined, "", "   "]) {
      expect(fieldErrors({ leadId: LEAD_ID, stage: "lost", lostReason }, leadStageChangeSchema).lostReason).toEqual([
        "Indica el motivo de la pérdida.",
      ]);
    }
  });

  it.each(["ab", "x".repeat(201)])("rejects a lost reason of %#: outside 3–200 characters", (lostReason) => {
    expect(fieldErrors({ leadId: LEAD_ID, stage: "lost", lostReason }, leadStageChangeSchema).lostReason).toEqual([
      "El motivo debe tener entre 3 y 200 caracteres.",
    ]);
  });

  it("trims and keeps the reason for lost", () => {
    expect(leadStageChangeSchema.parse({ leadId: LEAD_ID, stage: "lost", lostReason: "  Eligió otra agencia " })).toEqual({
      leadId: LEAD_ID,
      stage: "lost",
      lostReason: "Eligió otra agencia",
    });
  });

  it("forces the reason to null in any other stage", () => {
    expect(
      leadStageChangeSchema.parse({ leadId: LEAD_ID, stage: "quoted", lostReason: "x", actorUserId: "intruder" }),
    ).toEqual({ leadId: LEAD_ID, stage: "quoted", lostReason: null });
  });

  it("rejects an unknown stage and a leadId that is not a UUID", () => {
    const errors = fieldErrors({ leadId: "abc", stage: "archived", lostReason: "" }, leadStageChangeSchema);
    expect(errors.stage).toEqual(["Elige una etapa."]);
    expect(errors.leadId).toEqual(["El lead no es válido."]);
  });
});

describe("leadOwnerChangeSchema", () => {
  it("accepts an owner id and drops other keys", () => {
    expect(leadOwnerChangeSchema.parse({ leadId: LEAD_ID, ownerUserId: "user-2", actorUserId: "x" })).toEqual({
      leadId: LEAD_ID,
      ownerUserId: "user-2",
    });
  });

  it.each([["missing", undefined], ["empty", ""]])("never leaves a lead without owner: %s owner is rejected", (_, ownerUserId) => {
    expect(fieldErrors({ leadId: LEAD_ID, ownerUserId }, leadOwnerChangeSchema).ownerUserId).toEqual([
      "Elige un responsable.",
    ]);
  });
});

describe("leadSourceChangeSchema", () => {
  const valid = { leadId: LEAD_ID, source: "event", sourceDetail: "  Maratón de Lima 2026 " };

  it("accepts a source with its detail and drops other keys", () => {
    expect(leadSourceChangeSchema.parse({ ...valid, actorUserId: "intruder", stage: "paid" })).toEqual({
      leadId: LEAD_ID,
      source: "event",
      sourceDetail: "Maratón de Lima 2026",
    });
  });

  it.each(SOURCES_IN_UI_ORDER)("accepts the target source %s (the web_form rule lives in the service)", (source) => {
    expect(leadSourceChangeSchema.parse({ ...valid, source }).source).toBe(source);
  });

  it("accepts web_form with a new detail (a web_form lead editing its detail)", () => {
    expect(
      leadSourceChangeSchema.parse({ leadId: LEAD_ID, source: "web_form", sourceDetail: " Dijo que nos vio en Instagram " }),
    ).toEqual({ leadId: LEAD_ID, source: "web_form", sourceDetail: "Dijo que nos vio en Instagram" });
  });

  it.each([["missing", undefined], ["empty", ""]])("turns a %s detail into null", (_, sourceDetail) => {
    expect(leadSourceChangeSchema.parse({ ...valid, source: "unknown", sourceDetail })).toEqual({
      leadId: LEAD_ID,
      source: "unknown",
      sourceDetail: null,
    });
  });

  it.each([[""], [undefined], ["whatsapp_business"], ["Instagram"]])("rejects the target source %j", (source) => {
    expect(fieldErrors({ ...valid, source }, leadSourceChangeSchema).source).toEqual(["Elige el origen del lead."]);
  });

  it.each(["a", "a".repeat(121)])("rejects a detail of %#: outside 2–120 characters", (sourceDetail) => {
    expect(fieldErrors({ ...valid, sourceDetail }, leadSourceChangeSchema)).toEqual({
      sourceDetail: ["El detalle debe tener entre 2 y 120 caracteres."],
    });
  });

  it("rejects a leadId that is not a UUID", () => {
    expect(fieldErrors({ ...valid, leadId: "abc" }, leadSourceChangeSchema).leadId).toEqual(["El lead no es válido."]);
  });
});

describe("leadActivityFormSchema", () => {
  const valid = { leadId: LEAD_ID, type: "call", body: "  Llamó para preguntar por el viaje.  " };

  it("accepts a manual follow-up, trims the text and drops other keys", () => {
    expect(leadActivityFormSchema.parse({ ...valid, actorUserId: "intruder", stageFrom: "new" })).toEqual({
      leadId: LEAD_ID,
      type: "call",
      body: "Llamó para preguntar por el viaje.",
    });
  });

  it("only offers manual types, all of them activity types", () => {
    expect(leadActivityFormSchema.shape.type.options).toEqual(["note", "call", "message"]);
    for (const type of leadActivityFormSchema.shape.type.options) {
      expect(leadActivityTypeSchema.options).toContain(type);
    }
  });

  it.each(["created", "stage_changed", "owner_changed", "archived", "automation", "source_changed", ""])(
    "rejects the system type %j",
    (type) => {
      expect(fieldErrors({ ...valid, type }, leadActivityFormSchema).type).toEqual(["Elige el tipo de seguimiento."]);
    },
  );

  it.each([["empty", ""], ["blank", "   "], ["missing", undefined]])("rejects a %s text", (_, body) => {
    expect(fieldErrors({ ...valid, body }, leadActivityFormSchema).body).toEqual(["Escribe el texto del seguimiento."]);
  });

  it("accepts 2000 characters and rejects 2001", () => {
    expect(leadActivityFormSchema.safeParse({ ...valid, body: "a".repeat(2000) }).success).toBe(true);
    expect(fieldErrors({ ...valid, body: "a".repeat(2001) }, leadActivityFormSchema).body).toEqual([
      "El texto puede tener hasta 2000 caracteres.",
    ]);
  });

  it("rejects a leadId that is not a UUID", () => {
    expect(fieldErrors({ ...valid, leadId: "abc" }, leadActivityFormSchema).leadId).toEqual(["El lead no es válido."]);
  });
});

describe("nextActionSchema", () => {
  const valid = { leadId: LEAD_ID, nextActionDate: "2026-10-25", nextActionNote: "  Enviar la cotización.  " };

  it("accepts a date with a note, trims the note and drops other keys", () => {
    expect(nextActionSchema.parse({ ...valid, stage: "paid", actorUserId: "intruder" })).toEqual({
      leadId: LEAD_ID,
      nextActionDate: "2026-10-25",
      nextActionNote: "Enviar la cotización.",
    });
  });

  it("accepts a date without a note", () => {
    expect(nextActionSchema.parse({ ...valid, nextActionNote: "  " })).toEqual({
      leadId: LEAD_ID,
      nextActionDate: "2026-10-25",
      nextActionNote: null,
    });
  });

  it.each([["empty", { nextActionDate: "", nextActionNote: "" }], ["missing", {}]])(
    "turns %s fields into null/null (clears the next action)",
    (_, fields) => {
      expect(nextActionSchema.parse({ leadId: LEAD_ID, ...fields })).toEqual({
        leadId: LEAD_ID,
        nextActionDate: null,
        nextActionNote: null,
      });
    },
  );

  it("rejects a note without a date with «Indica la fecha.» on the date", () => {
    expect(fieldErrors({ ...valid, nextActionDate: "" }, nextActionSchema)).toEqual({
      nextActionDate: ["Indica la fecha."],
    });
  });

  it.each(["2026-02-30", "2026-13-01", "25/10/2026", "2026-10-25T10:00", "mañana"])(
    "rejects the invalid date %j",
    (nextActionDate) => {
      expect(fieldErrors({ ...valid, nextActionDate }, nextActionSchema).nextActionDate).toEqual([
        "Indica una fecha válida.",
      ]);
    },
  );

  it("accepts a 200-character note and rejects 201", () => {
    expect(nextActionSchema.safeParse({ ...valid, nextActionNote: "a".repeat(200) }).success).toBe(true);
    expect(fieldErrors({ ...valid, nextActionNote: "a".repeat(201) }, nextActionSchema).nextActionNote).toEqual([
      "La nota puede tener hasta 200 caracteres.",
    ]);
  });

  it("rejects a leadId that is not a UUID", () => {
    expect(fieldErrors({ ...valid, leadId: "abc" }, nextActionSchema).leadId).toEqual(["El lead no es válido."]);
  });

  it("never echoes the input in its messages", () => {
    const result = nextActionSchema.safeParse({ ...valid, nextActionDate: "secreto", nextActionNote: "b".repeat(201) });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues.map((issue) => issue.message))).not.toMatch(/secreto|bbbb/);
  });
});
