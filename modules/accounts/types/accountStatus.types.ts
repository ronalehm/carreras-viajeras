import type { z } from "zod";
import type { accountTargetSchema, deleteAccountSchema } from "../schemas/accountStatus.schema";

export type AccountTargetInput = z.infer<typeof accountTargetSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

// disabled = blocked in the guards (disabled_at); deleted = anonymized and blocked (deleted_at).
export type AccountStatus = "active" | "disabled" | "deleted";

// Compatible with ConfirmActionState (components/shared/ConfirmActionButton).
// clerk_failed: Neon already changed; only the Clerk call is pending ("Reintentar en Clerk").
export type AccountStatusActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      code:
        | "unauthorized"
        | "forbidden"
        | "invalid_input"
        | "self"
        | "protected"
        | "not_found"
        | "last_admin"
        | "email_mismatch"
        | "clerk_failed";
    };
