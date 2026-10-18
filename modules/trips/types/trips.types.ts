import type { InferSelectModel } from "drizzle-orm";
import type { z } from "zod";
import type { trips } from "@/lib/db-schema";
import type { tripFormSchema, tripStatusSchema } from "../schemas/trips.schema";

export type Trip = InferSelectModel<typeof trips>;
export type TripStatus = z.infer<typeof tripStatusSchema>;
export type TripInput = z.output<typeof tripFormSchema>;

export type TripActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      code: "unauthorized" | "forbidden" | "invalid_input" | "slug_taken" | "slug_locked"
        | "not_found" | "archived" | "invalid_transition";
      message: string;
      fieldErrors?: Record<string, string[]>;
      values?: Record<string, string>;
    };

// Public read contract for the landing: published trips only, no internal fields.
export type PublicTrip = {
  slug: string; // stable public identifier while published
  title: string;
  city: string;
  country: string;
  raceDate: string; // YYYY-MM-DD
  startDate: string | null; // YYYY-MM-DD; both or neither
  endDate: string | null;
  distances: string[]; // 1..10, e.g. ["42K", "21K", "10K"]
  summary: string; // 10..300 characters
  includes: string[]; // 0..20 items
  priceUsd: number | null; // integer "from" price in USD; null → "Precio a consultar"
  capacity: number | null; // total informational seats
  imageUrl: string | null; // external https:// URL
};
