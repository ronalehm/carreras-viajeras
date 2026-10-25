import { describe, expect, it } from "vitest";
import {
  contactPreferenceSchema,
  leadActivityTypeSchema,
  leadChannelSchema,
  leadSourceSchema,
} from "../schemas/leads.schema";
import {
  CONTACT_PREFERENCE_LABELS,
  LEAD_ACTIVITY_LABELS,
  LEAD_CHANNEL_LABELS,
  LEAD_SOURCE_LABELS,
  leadChannelLabel,
  leadOwnerLabel,
  leadTripLabel,
  OPT_OUT_LOST_REASON,
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
    });
    expect(CONTACT_PREFERENCE_LABELS).toEqual({ whatsapp: "WhatsApp", email: "Correo", call: "Llamada" });
  });

  it("label the origin change and the opt-out in the history", () => {
    expect(LEAD_ACTIVITY_LABELS.channel_changed).toBe("Origen");
    expect(LEAD_ACTIVITY_LABELS.opted_out).toBe("Pidió no seguir");
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
