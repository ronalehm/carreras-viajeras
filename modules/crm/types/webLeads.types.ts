import type { z } from "zod";
import type { webLeadFormSchema } from "../schemas/webLeads.schema";

export type WebLeadInput = z.output<typeof webLeadFormSchema>;

export type WebLeadFormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      code: "invalid_input" | "verification_failed" | "conflict" | "unavailable";
      message: string;
      fieldErrors?: Partial<Record<"name" | "email" | "phone" | "destination" | "consent", string[]>>;
    };
