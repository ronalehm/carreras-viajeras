// @vitest-environment node
import { describe, expect, it } from "vitest";
import { staffRoleEnum } from "@/lib/db-schema";
import {
  assignableRoleSchema,
  assignmentRoleSchema,
  invitationIdSchema,
  inviteStaffSchema,
  staffRoleChangeSchema,
  staffRoleRevokeSchema,
  staffRoleSchema,
} from "./staff.schema";

const SPONSOR_ID = "8a6b2c1d-4e5f-4a7b-9c8d-1e2f3a4b5c6d";

const issuePaths = (result: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path);

describe("assignmentRoleSchema", () => {
  it("matches every staff_role database enum value", () => {
    expect(assignmentRoleSchema.options).toEqual(staffRoleEnum.enumValues);
  });
});

describe("staffRoleSchema", () => {
  it("matches the database enum minus roles excluded from team forms", () => {
    const managedRoles = staffRoleEnum.enumValues.filter((role) => role !== "super_admin" && role !== "sponsor");

    expect([...staffRoleSchema.options].sort()).toEqual([...managedRoles].sort());
  });
});

describe("inviteStaffSchema", () => {
  it("trims the email and lowercases it", () => {
    const result = inviteStaffSchema.safeParse({ email: "  Luis@Example.com ", role: "commercial" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ email: "luis@example.com", role: "commercial" });
  });

  it.each(["", "   ", "not-an-email", "luis@", "@example.com"])("rejects the email %j", (email) => {
    const result = inviteStaffSchema.safeParse({ email, role: "commercial" });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual([["email"]]);
  });

  it("accepts the organizer role", () => {
    const result = inviteStaffSchema.safeParse({ email: "luis@example.com", role: "organizer" });

    expect(result.data).toEqual({ email: "luis@example.com", role: "organizer" });
  });

  it.each(["operations", "moderator", "", "ADMIN", "super_admin", "sponsor", undefined])("rejects the role %j", (role) => {
    const result = inviteStaffSchema.safeParse({ email: "luis@example.com", role });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual([["role"]]);
  });

  it("drops extra keys such as invitedBy and expiresAt", () => {
    const result = inviteStaffSchema.safeParse({
      email: "luis@example.com",
      role: "admin",
      invitedBy: "attacker",
      expiresAt: "2099-01-01",
    });

    expect(result.data).toEqual({ email: "luis@example.com", role: "admin" });
  });
});

describe("invitationIdSchema", () => {
  it("accepts a UUID", () => {
    const invitationId = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";

    expect(invitationIdSchema.safeParse({ invitationId }).data).toEqual({ invitationId });
  });

  it.each(["", "123", "not-a-uuid", "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a9", "3f1c2a6e8b4d4c1e9f0a2b7d5e6c8a91"])(
    "rejects the id %j",
    (invitationId) => {
      const result = invitationIdSchema.safeParse({ invitationId });

      expect(result.success).toBe(false);
      expect(issuePaths(result)).toEqual([["invitationId"]]);
    },
  );
});

describe("staffRoleChangeSchema", () => {
  it("accepts a user id and a role, dropping extra keys", () => {
    const result = staffRoleChangeSchema.safeParse({ userId: "user-1", role: "admin", grantedBy: "x" });

    expect(result.data).toEqual({ userId: "user-1", role: "admin" });
  });

  it.each(["", "x".repeat(256)])("rejects a user id of length %#", (userId) => {
    const result = staffRoleChangeSchema.safeParse({ userId, role: "commercial" });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual([["userId"]]);
  });

  it("accepts the organizer role", () => {
    const result = staffRoleChangeSchema.safeParse({ userId: "user-1", role: "organizer" });

    expect(result.data).toEqual({ userId: "user-1", role: "organizer" });
  });

  it.each(["moderator", "super_admin", "", undefined])("rejects the role %j", (role) => {
    const result = staffRoleChangeSchema.safeParse({ userId: "user-1", role });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual([["role"]]);
  });

  it("reports userId and role errors together", () => {
    const result = staffRoleChangeSchema.safeParse({ userId: "", role: "moderator" });

    expect(issuePaths(result)).toEqual([["userId"], ["role"]]);
  });

  it("accepts sponsor with a brand id, dropping extra keys", () => {
    const result = staffRoleChangeSchema.safeParse({
      userId: "user-1",
      role: "sponsor",
      sponsorId: SPONSOR_ID,
      grantedBy: "attacker",
    });

    expect(result.data).toEqual({ userId: "user-1", role: "sponsor", sponsorId: SPONSOR_ID });
  });

  it.each([undefined, "", "not-a-uuid", "3f1c2a6e8b4d4c1e9f0a2b7d5e6c8a91"])(
    "requires a valid sponsorId for sponsor (%j)",
    (sponsorId) => {
      const result = staffRoleChangeSchema.safeParse({ userId: "user-1", role: "sponsor", sponsorId });

      expect(result.success).toBe(false);
      expect(issuePaths(result)).toEqual([["sponsorId"]]);
    },
  );

  it.each(["commercial", "organizer", "admin"])("ignores sponsorId for %s", (role) => {
    const result = staffRoleChangeSchema.safeParse({ userId: "user-1", role, sponsorId: "not-a-uuid" });

    expect(result.data).toEqual({ userId: "user-1", role });
  });
});

describe("assignableRoleSchema", () => {
  it("is the team roles plus sponsor, never super_admin", () => {
    expect(assignableRoleSchema.options).toEqual(["commercial", "organizer", "admin", "sponsor"]);
  });
});

describe("staffRoleRevokeSchema", () => {
  it.each(["commercial", "organizer", "admin", "sponsor"])("accepts %s without a brand", (role) => {
    const result = staffRoleRevokeSchema.safeParse({ userId: "user-1", role, sponsorId: SPONSOR_ID, revokedBy: "x" });

    expect(result.data).toEqual({ userId: "user-1", role });
  });

  it.each(["moderator", "super_admin", ""])("rejects the role %j", (role) => {
    const result = staffRoleRevokeSchema.safeParse({ userId: "user-1", role });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual([["role"]]);
  });

  it.each(["", "x".repeat(256)])("rejects a user id of length %#", (userId) => {
    const result = staffRoleRevokeSchema.safeParse({ userId, role: "sponsor" });

    expect(issuePaths(result)).toEqual([["userId"]]);
  });
});
