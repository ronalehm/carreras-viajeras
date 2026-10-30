import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  contactPreferenceEnum,
  leadActivityTypeEnum,
  leadChannelEnum,
  leadSourceEnum,
  leadStageEnum,
} from "@/lib/db-schema";
import {
  blankToNull,
  contactPreferenceSchema,
  createLeadSchema,
  leadActivityFormSchema,
  leadActivityTypeSchema,
  leadChannelSchema,
  leadIdSchema,
  leadListQuerySchema,
  leadOwnerChangeSchema,
  leadReportQuerySchema,
  leadSourceSchema,
  leadStageChangeSchema,
  leadStageSchema,
  nextActionSchema,
  phoneSchema,
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
  channel: "unknown",
  originDetail: "",
  referredBy: "",
  contactPreference: "",
};

// Origin fields as the form sends them, normalized.
const blankOrigin = {
  channel: "unknown",
  originDetail: null,
  referredBy: null,
  referralPermission: false,
  contactPreference: null,
};

function fieldErrors(input: Record<string, unknown>, schema: z.ZodType = createLeadSchema) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected a validation error");
  return z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
}

const sorted = (values: readonly string[]) => [...values].sort();

describe("lead enums", () => {
  it("match the database enums", () => {
    expect(leadStageSchema.options).toEqual(leadStageEnum.enumValues);
    expect(sorted(leadSourceSchema.options)).toEqual(sorted(leadSourceEnum.enumValues));
    expect(sorted(leadChannelSchema.options)).toEqual(sorted(leadChannelEnum.enumValues));
    expect(sorted(contactPreferenceSchema.options)).toEqual(sorted(contactPreferenceEnum.enumValues));
    expect(sorted(leadActivityTypeSchema.options)).toEqual(sorted(leadActivityTypeEnum.enumValues));
  });

  it("include the new entry paths, preferences and activity types", () => {
    expect(leadSourceSchema.options).toEqual(
      expect.arrayContaining(["google_form", "import", "runner_account"]),
    );
    expect(contactPreferenceSchema.options).toEqual(["whatsapp", "email", "call"]);
    expect(leadActivityTypeSchema.options).toEqual(expect.arrayContaining(["channel_changed", "opted_out"]));
  });

  it("list the 14 origins in the order of Requirement 2", () => {
    expect(leadChannelSchema.options).toEqual([
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
      "web",
      "other",
      "unknown",
    ]);
  });

  it("include the automation activity type (n8n)", () => {
    expect(leadActivityTypeSchema.options).toContain("automation");
    expect(leadActivityTypeEnum.enumValues).toContain("automation");
  });

  it("include re_registered (web form) and responded (sales cadence) last, as in the database", () => {
    expect(leadActivityTypeSchema.options.slice(-2)).toEqual(["re_registered", "responded"]);
    expect(leadActivityTypeEnum.enumValues.slice(-2)).toEqual(["re_registered", "responded"]);
  });
});

describe("blankToNull", () => {
  const schema = blankToNull(z.string().min(2, "Mínimo 2 caracteres."));

  it("turns a blank, whitespace-only or missing value into null", () => {
    expect(schema.parse("")).toBeNull();
    expect(schema.parse("   ")).toBeNull();
    expect(schema.parse(undefined)).toBeNull();
  });

  it("trims a filled value and validates it with the inner schema", () => {
    expect(schema.parse("  Lima ")).toBe("Lima");
    const result = schema.safeParse(" a ");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Mínimo 2 caracteres.");
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
      ownerUserId: "user-1",
      note: null,
      consent: "on",
      ...blankOrigin,
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
    const optionalKeys = [
      "email",
      "location",
      "tripId",
      "destinationText",
      "note",
      "originDetail",
      "referredBy",
      "contactPreference",
    ];
    const required = Object.fromEntries(Object.entries(validForm).filter(([key]) => !optionalKeys.includes(key)));
    const result = createLeadSchema.safeParse(required);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      email: null,
      location: null,
      tripId: null,
      destinationText: null,
      note: null,
      originDetail: null,
      referredBy: null,
      referralPermission: false,
      contactPreference: null,
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

  it.each(["web_form", "google_form", "import", "runner_account", "", undefined])(
    "rejects the entry path %j in the manual form (system paths are never offered)",
    (source) => {
      expect(fieldErrors({ ...validForm, source }).source).toEqual(["Elige la vía de entrada del lead."]);
    },
  );

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

// Origin rules shared by the manual form and the edit (same cases, same messages).
describe.each([
  ["createLeadSchema", createLeadSchema, validForm],
  [
    "updateLeadSchema",
    updateLeadSchema,
    {
      leadId: LEAD_ID,
      fullName: "Ana Pérez",
      phone: "+51 938 127 170",
      channel: "unknown",
    },
  ],
] as const)("%s: origin fields", (_, schema, valid) => {
  const parse = (input: Record<string, unknown>) => schema.parse({ ...valid, ...input });
  const errors = (input: Record<string, unknown>) => fieldErrors({ ...valid, ...input }, schema);

  it.each([
    ["missing", undefined],
    ["empty («Elige el origen»)", ""],
    ["unknown", "foo"],
    ["an entry path", "web_form"],
  ])("rejects a %s channel with «Elige el origen del lead.»", (_, channel) => {
    expect(errors({ channel }).channel).toEqual(["Elige el origen del lead."]);
  });

  it.each(leadChannelSchema.options)("accepts the channel %s", (channel) => {
    expect(parse({ channel }).channel).toBe(channel);
  });

  it("trims the origin detail and the referrer and turns blanks into null", () => {
    expect(parse({ originDetail: "  Media Maratón de Lima 2026 ", referredBy: " Club Andino " })).toMatchObject({
      originDetail: "Media Maratón de Lima 2026",
      referredBy: "Club Andino",
    });
    expect(parse({ originDetail: "   ", referredBy: "" })).toMatchObject({ originDetail: null, referredBy: null });
  });

  it("accepts 2 and 120 characters", () => {
    expect(parse({ originDetail: "ab", referredBy: "x".repeat(120) })).toMatchObject({
      originDetail: "ab",
      referredBy: "x".repeat(120),
    });
  });

  it.each([
    ["1 character", " a "],
    ["121 characters", "x".repeat(121)],
  ])("rejects an origin detail and a referrer of %s in their fields", (_, text) => {
    expect(errors({ originDetail: text, referredBy: text })).toEqual({
      originDetail: ["El detalle del origen debe tener entre 2 y 120 caracteres."],
      referredBy: ["El referente debe tener entre 2 y 120 caracteres."],
    });
  });

  it("turns the referral permission checkbox into a boolean", () => {
    expect(parse({ referredBy: "Club Andino", referralPermission: "on" }).referralPermission).toBe(true);
    expect(parse({ referredBy: "Club Andino" }).referralPermission).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["blank", "  "],
  ])("rejects the referral permission with a %s referrer: «Indica quién lo refirió.»", (_, referredBy) => {
    expect(errors({ referralPermission: "on", referredBy })).toEqual({ referredBy: ["Indica quién lo refirió."] });
  });

  it("accepts each contact preference, turns a blank into null and rejects an unknown one", () => {
    for (const contactPreference of contactPreferenceSchema.options) {
      expect(parse({ contactPreference }).contactPreference).toBe(contactPreference);
    }
    expect(parse({ contactPreference: "" }).contactPreference).toBeNull();
    expect(errors({ contactPreference: "sms" }).contactPreference).toEqual(["Elige una preferencia de contacto."]);
  });

  it("drops the UTM fields, the opt-out, the stage and the entry path written by the system", () => {
    const result = parse({
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "santiago-2027",
      contactOptOutAt: "2026-10-25T10:00:00Z",
      stage: "paid",
    });
    for (const key of ["utmSource", "utmMedium", "utmCampaign", "contactOptOutAt", "stage"]) {
      expect(result).not.toHaveProperty(key);
    }
  });
});

describe("createLeadSchema: a referral lead", () => {
  it("keeps the origin, detail, referrer, permission and preference", () => {
    expect(
      createLeadSchema.parse({
        ...validForm,
        channel: "referral",
        originDetail: " Recomendación en el club ",
        referredBy: " Club Andino ",
        referralPermission: "on",
        contactPreference: "call",
      }),
    ).toMatchObject({
      channel: "referral",
      originDetail: "Recomendación en el club",
      referredBy: "Club Andino",
      referralPermission: true,
      contactPreference: "call",
    });
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

describe("leadListQuerySchema: origen", () => {
  it.each(leadChannelSchema.options)("accepts origen=%s", (origen) => {
    expect(leadListQuerySchema.parse({ origen }).origen).toBe(origen);
  });

  it.each([["foo"], ["Instagram"], ["web_form"], [""], [["event", "event"]]])(
    "treats origen=%j as no origin filter and keeps the other filters",
    (origen) => {
      expect(leadListQuerySchema.parse({ origen, etapa: "new" })).toEqual({
        etapa: "new",
        responsable: undefined,
        seguimiento: undefined,
        origen: undefined,
        pagina: 1,
      });
    },
  );
});

describe("leadReportQuerySchema", () => {
  it("defaults to no cohort, every trip and imported leads excluded", () => {
    expect(leadReportQuerySchema.parse({})).toEqual({
      cohort: undefined,
      tripId: undefined,
      onlyImported: false,
    });
  });

  it("maps cohorte, viaje and importados=solo", () => {
    expect(leadReportQuerySchema.parse({ cohorte: "2026-10", viaje: TRIP_ID, importados: "solo" })).toEqual({
      cohort: "2026-10",
      tripId: TRIP_ID,
      onlyImported: true,
    });
  });

  it.each(["2026-01", "2026-12", "2027-05"])("accepts the cohort %s", (cohorte) => {
    expect(leadReportQuerySchema.parse({ cohorte }).cohort).toBe(cohorte);
  });

  it.each([["2026-13"], ["2026-00"], ["2026-1"], ["26-10"], ["2026-10-01"], [""], [["2026-10", "2026-09"]]])(
    "drops the invalid cohorte %j only",
    (cohorte) => {
      expect(leadReportQuerySchema.parse({ cohorte, viaje: TRIP_ID })).toEqual({
        cohort: undefined,
        tripId: TRIP_ID,
        onlyImported: false,
      });
    },
  );

  it.each([["abc"], [""], [[TRIP_ID, TRIP_ID]]])("drops the invalid viaje %j only", (viaje) => {
    expect(leadReportQuerySchema.parse({ viaje, cohorte: "2026-10" })).toEqual({
      cohort: "2026-10",
      tripId: undefined,
      onlyImported: false,
    });
  });

  it.each([["foo"], ["Solo"], [""], [["solo", "solo"]]])(
    "treats importados=%j as excluding the imported leads",
    (importados) => {
      expect(leadReportQuerySchema.parse({ importados }).onlyImported).toBe(false);
    },
  );

  it("drops unknown keys", () => {
    expect(leadReportQuerySchema.parse({ cohorte: "2026-10", etapa: "new", origen: "event" })).toEqual({
      cohort: "2026-10",
      tripId: undefined,
      onlyImported: false,
    });
  });
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
    channel: "instagram",
    originDetail: "",
    referredBy: "",
    contactPreference: "",
  };

  it("normalizes the contact and origin fields and drops every other key", () => {
    const result = updateLeadSchema.parse({
      ...validEdit,
      stage: "paid",
      source: "web_form",
      ownerUserId: "intruder",
      actorUserId: "intruder",
      consent: "on",
      utmSource: "instagram",
      contactOptOutAt: "2026-10-25T10:00:00Z",
    });
    expect(result).toEqual({
      leadId: LEAD_ID,
      fullName: "Ana Pérez",
      phone: "+51938127170",
      email: null,
      location: "Lima",
      tripId: TRIP_ID,
      destinationText: null,
      ...blankOrigin,
      channel: "instagram",
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

  it.each(["created", "stage_changed", "owner_changed", "archived", "automation", ""])(
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
