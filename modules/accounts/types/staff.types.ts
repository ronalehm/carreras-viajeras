import type { z } from "zod";
import type { StaffRole } from "@/lib/auth/permissions";
import type { inviteStaffSchema, staffRoleChangeSchema } from "../schemas/staff.schema";

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;
export type StaffRoleChangeInput = z.infer<typeof staffRoleChangeSchema>;

export type StaffMember = {
  userId: string;
  email: string;
  roles: { role: StaffRole; grantedAt: Date }[];
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: StaffRole;
  expiresAt: Date;
  expired: boolean;
};

export type StaffActionState =
  | { status: "idle" }
  | { status: "success"; message: string; acceptUrl?: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
      code:
        | "unauthorized"
        | "forbidden"
        | "invalid_input"
        | "pending_invitation_exists"
        | "not_found"
        | "no_change"
        | "last_admin";
    };
