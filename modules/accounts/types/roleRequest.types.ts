import type { z } from "zod";
import type { roleRequestIdSchema } from "../schemas/roleRequest.schema";

export type RoleRequestIdInput = z.infer<typeof roleRequestIdSchema>;

// The signed-in account's own pending request: only its date is shown.
export type OwnPendingRoleRequest = { createdAt: Date };

// Pending requests listed to super_admin: id, email and date only.
export type PendingRoleRequest = {
  id: string;
  email: string;
  createdAt: Date;
};

// Compatible with ConfirmActionState (components/shared/ConfirmActionButton).
export type RoleRequestActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      code:
        | "unauthorized"
        | "forbidden"
        | "email_unverified"
        | "invalid_input"
        | "already_has_access"
        | "not_found";
    };
