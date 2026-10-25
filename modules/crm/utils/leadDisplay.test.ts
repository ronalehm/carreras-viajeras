import { describe, expect, it } from "vitest";
import { leadSourceSchema } from "../schemas/leads.schema";
import { LEAD_ACTIVITY_LABELS, LEAD_SOURCE_LABELS, leadOwnerLabel, leadSourceLabel, leadTripLabel } from "./leadDisplay";

describe("LEAD_SOURCE_LABELS", () => {
  it("has the label of Requirement 1 for each of the 14 sources, in their order", () => {
    expect(Object.keys(LEAD_SOURCE_LABELS)).toEqual(leadSourceSchema.options);
    expect(LEAD_SOURCE_LABELS).toEqual({
      event: "Feria, carrera o activación",
      partner: "Club, gimnasio o aliado",
      referral: "Referido",
      whatsapp: "WhatsApp (mensaje directo)",
      whatsapp_status: "Estado de WhatsApp",
      instagram: "Instagram",
      facebook: "Facebook",
      tiktok: "TikTok",
      youtube: "YouTube",
      google_ads: "Google Ads",
      luma: "Luma",
      web_form: "Formulario web",
      other: "Otro",
      unknown: "Desconocido",
    });
  });

  it("labels the source_changed activity", () => {
    expect(LEAD_ACTIVITY_LABELS.source_changed).toBe("Cambió el origen");
  });
});

describe("leadSourceLabel", () => {
  it("joins the label and the detail with «·»", () => {
    expect(leadSourceLabel("event", "Maratón de Lima 2026")).toBe("Feria, carrera o activación · Maratón de Lima 2026");
  });

  it("shows only the label without a detail", () => {
    expect(leadSourceLabel("unknown", null)).toBe("Desconocido");
    expect(leadSourceLabel("web_form", "")).toBe("Formulario web");
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
