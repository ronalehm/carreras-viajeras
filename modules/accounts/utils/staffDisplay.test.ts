// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assignmentRoleSchema } from "../schemas/staff.schema";
import { formatStaffDateTime, STAFF_ROLE_LABELS } from "./staffDisplay";

describe("formatStaffDateTime", () => {
  it("formats the date and time in the CRM time zone", () => {
    expect(formatStaffDateTime(new Date("2026-10-18T15:30:00Z"))).toBe("18 oct 2026, 10:30");
  });

  it("keeps the local day instead of jumping to the UTC day", () => {
    expect(formatStaffDateTime(new Date("2026-10-19T03:00:00Z"))).toBe("18 oct 2026, 22:00");
  });
});

describe("STAFF_ROLE_LABELS", () => {
  it("has a label for every assignment role", () => {
    expect(Object.keys(STAFF_ROLE_LABELS).sort()).toEqual([...assignmentRoleSchema.options].sort());
    for (const role of assignmentRoleSchema.options) {
      expect(STAFF_ROLE_LABELS[role]).toMatch(/\S/);
    }
  });

  it("uses the Spanish labels", () => {
    expect(STAFF_ROLE_LABELS).toEqual({ commercial: "Comercial", admin: "Admin", sponsor: "Patrocinador" });
  });
});
