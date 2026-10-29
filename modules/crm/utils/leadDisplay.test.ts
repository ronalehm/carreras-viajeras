import { describe, expect, it } from "vitest";
import {
  contactPreferenceSchema,
  leadActivityTypeSchema,
  leadChannelSchema,
  leadSourceSchema,
} from "../schemas/leads.schema";
import {
  CONTACT_PREFERENCE_LABELS,
  formatCohort,
  LEAD_ACTIVITY_LABELS,
  LEAD_CHANNEL_LABELS,
  LEAD_SOURCE_LABELS,
  leadChannelLabel,
  leadOwnerLabel,
  leadTripLabel,
  OPT_OUT_LOST_REASON,
  SYSTEM_ACTOR_LABELS,
} from "./leadDisplay";

describe("lead labels", () => {
  it.each([
    ["origin", leadChannelSchema.options, LEAD_CHANNEL_LABELS],
    ["entry path", leadSourceSchema.options, LEAD_SOURCE_LABELS],
    ["contact preference", contactPreferenceSchema.options, CONTACT_PREFERENCE_LABELS],
    ["activity type", leadActivityTypeSchema.options, LEAD_ACTIVITY_LABELS],
  ] as const)("label every %s value and nothing else", (_, values, labels) => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const value of values) expect((labels as Record<string, string>)[value].trim()).not.toBe("");
  });

  it("label the 14 origins in the order of Requirement 2", () => {
    expect(Object.keys(LEAD_CHANNEL_LABELS)).toEqual(leadChannelSchema.options);
    expect(Object.values(LEAD_CHANNEL_LABELS)).toEqual([
      "Feria, carrera o activación",
      "Club, gimnasio o aliado",
      "Referido",
      "WhatsApp (mensaje directo)",
      "Estado de WhatsApp",
      "Instagram",
      "Facebook",
      "TikTok",
      "YouTube",
      "Google Ads",
      "Luma",
      "Web",
      "Otro",
      "Desconocido",
    ]);
  });

  it("label the entry paths and the contact preferences", () => {
    expect(LEAD_SOURCE_LABELS).toEqual({
      whatsapp: "WhatsApp",
      web_form: "Formulario web",
      google_form: "Google Forms",
      import: "Importación",
      other: "Otro",
      runner_account: "Cuenta web",
    });
    expect(CONTACT_PREFERENCE_LABELS).toEqual({ whatsapp: "WhatsApp", email: "Correo", call: "Llamada" });
  });

  it("label the origin change and the opt-out in the history", () => {
    expect(LEAD_ACTIVITY_LABELS.channel_changed).toBe("Origen");
    expect(LEAD_ACTIVITY_LABELS.opted_out).toBe("Pidió no seguir");
  });

  it("label the re-registration in the history", () => {
    expect(LEAD_ACTIVITY_LABELS.re_registered).toBe("Volvió a registrarse");
  });

  it("label n8n and the web form as system authors: the entry path labels the created activity", () => {
    expect(SYSTEM_ACTOR_LABELS).toEqual({ automation: "n8n", re_registered: "Formulario web" });
  });

  it("fix the opt-out lost reason", () => {
    expect(OPT_OUT_LOST_REASON).toBe("Pidió no seguir en contacto.");
  });
});

describe("leadChannelLabel", () => {
  it("joins the label and the detail with « · »", () => {
    expect(leadChannelLabel("event", "Media Maratón de Lima 2026")).toBe(
      "Feria, carrera o activación · Media Maratón de Lima 2026",
    );
  });

  it("shows only the label without detail", () => {
    expect(leadChannelLabel("event", null)).toBe("Feria, carrera o activación");
    expect(leadChannelLabel("unknown", null)).toBe("Desconocido");
  });
});

describe("leadOwnerLabel", () => {
  it("shows the email, «(sin acceso)» for an owner without role and «Sin asignar» without owner", () => {
    expect(leadOwnerLabel({ userId: "u1", email: "ana@example.com", active: true })).toBe("ana@example.com");
    expect(leadOwnerLabel({ userId: "u1", email: "ana@example.com", active: false })).toBe(
      "ana@example.com (sin acceso)",
    );
    expect(leadOwnerLabel(null)).toBe("Sin asignar");
  });
});

describe("leadTripLabel", () => {
  it("marks drafts and archived trips", () => {
    expect(leadTripLabel({ title: "Maratón de Santiago 2027", status: "published" })).toBe("Maratón de Santiago 2027");
    expect(leadTripLabel({ title: "Maratón de Santiago 2027", status: "draft" })).toBe(
      "Maratón de Santiago 2027 (borrador)",
    );
    expect(leadTripLabel({ title: "Maratón de Santiago 2027", status: "archived" })).toBe(
      "Maratón de Santiago 2027 (archivado)",
    );
  });
});

describe("formatCohort", () => {
  it("shows the month name and the year", () => {
    expect(formatCohort("2026-10")).toBe("octubre de 2026");
    expect(formatCohort("2027-01")).toBe("enero de 2027");
    expect(formatCohort("2026-12")).toBe("diciembre de 2026");
  });

  // The first instant of each month in UTC is still the previous month west of UTC (America/Lima).
  it("formats in UTC, without shifting to the previous month", () => {
    const months = [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];
    months.forEach((name, index) => {
      expect(formatCohort(`2026-${String(index + 1).padStart(2, "0")}`)).toBe(`${name} de 2026`);
    });
  });
});
