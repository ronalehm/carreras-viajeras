import { describe, expect, it } from "vitest";
import { leadOwnerLabel, leadTripLabel } from "./leadDisplay";

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
