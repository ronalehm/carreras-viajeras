// @vitest-environment node
import { describe, expect, it } from "vitest";
import { staffRoleEnum } from "@/lib/db-schema";
import { formatAssignmentLabel, formatStaffDateTime, STAFF_ROLE_LABELS, USER_ROLE_FILTER_LABELS } from "./staffDisplay";

describe("formatStaffDateTime", () => {
  it("formats the date and time in the CRM time zone", () => {
    expect(formatStaffDateTime(new Date("2026-10-18T15:30:00Z"))).toBe("18 oct 2026, 10:30");
  });

  it("keeps the local day instead of jumping to the UTC day", () => {
    expect(formatStaffDateTime(new Date("2026-10-19T03:00:00Z"))).toBe("18 oct 2026, 22:00");
  });
});

describe("STAFF_ROLE_LABELS", () => {
  it("has a label for every staff_role database enum value", () => {
    expect(Object.keys(STAFF_ROLE_LABELS).sort()).toEqual([...staffRoleEnum.enumValues].sort());
    for (const role of staffRoleEnum.enumValues) {
      expect(STAFF_ROLE_LABELS[role]).toMatch(/\S/);
    }
  });

  it("uses the Spanish labels", () => {
    expect(STAFF_ROLE_LABELS).toEqual({
      commercial: "Comercial",
      admin: "Admin",
      super_admin: "Super admin",
      organizer: "Organizador",
      sponsor: "Patrocinador",
    });
  });
});

describe("formatAssignmentLabel", () => {
  it("adds the brand only to sponsor assignments", () => {
    expect(formatAssignmentLabel("sponsor", "Marca X")).toBe("Patrocinador · Marca X");
    expect(formatAssignmentLabel("sponsor", null)).toBe("Patrocinador");
    expect(formatAssignmentLabel("organizer", "Marca X")).toBe("Organizador");
  });

  it("labels every directory filter including runner", () => {
    expect(Object.keys(USER_ROLE_FILTER_LABELS).sort()).toEqual([...staffRoleEnum.enumValues, "runner"].sort());
    expect(USER_ROLE_FILTER_LABELS.runner).toBe("Runner");
  });
});
