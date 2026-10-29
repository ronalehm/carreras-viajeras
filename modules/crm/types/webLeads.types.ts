import type { z } from "zod";
import type { webLeadFormSchema } from "../schemas/webLeads.schema";

export type WebLeadInput = z.output<typeof webLeadFormSchema>;

// Visible form fields that may carry a validation message.
export type WebLeadField = "name" | "email" | "phone" | "destination" | "consent" | "marketing";

export type WebLeadFormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      code: "invalid_input" | "verification_failed" | "conflict" | "trip_unavailable" | "unavailable";
      message: string;
      fieldErrors?: Partial<Record<WebLeadField, string[]>>;
    };
