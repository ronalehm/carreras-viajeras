import type { InferSelectModel } from "drizzle-orm";
import type { z } from "zod";
import type { sponsors } from "@/lib/db-schema";
import type { sponsorFormSchema, updateSponsorSchema } from "../schemas/sponsors.schema";

export type Sponsor = InferSelectModel<typeof sponsors>;
export type SponsorInput = z.output<typeof sponsorFormSchema>;
export type SponsorUpdateInput = Omit<z.output<typeof updateSponsorSchema>, "id">;
export type SponsorBrand = Pick<Sponsor, "id" | "slug" | "name">;

// Public read contract: no id, created_by or audit dates.
export type PublicSponsor = {
  slug: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  description: string | null;
};

export type SponsorActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      code: "unauthorized" | "forbidden" | "invalid_input" | "slug_taken" | "not_found";
      message: string;
      fieldErrors?: Record<string, string[]>;
      values?: Record<string, string>;
    };
