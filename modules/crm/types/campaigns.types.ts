import type { z } from "zod";
import type { campaignStatusEnum } from "@/lib/db-schema";
import type { campaignFormSchema } from "../schemas/campaigns.schema";
import type { LeadChannel } from "./leads.types";

export type CampaignInput = z.output<typeof campaignFormSchema>;

export type CampaignStatus = (typeof campaignStatusEnum.enumValues)[number];

// leadCount: new leads attributed to the campaign (registrations, not visits).
export type CampaignListItem = {
  id: string;
  code: string;
  name: string;
  channel: LeadChannel;
  eventName: string | null;
  status: CampaignStatus;
  trip: { slug: string; title: string };
  createdAt: Date;
  leadCount: number;
};

export type CampaignDetail = CampaignListItem & {
  createdBy: { email: string };
  closedAt: Date | null;
  closedBy: { email: string } | null;
};

// Compatible with useActionState. values only echoes the action's known form fields, to restore
// the same user's form; messages never repeat what was typed.
export type CampaignActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      code: "unauthorized" | "forbidden" | "invalid_input" | "code_taken" | "invalid_trip" | "not_found";
      message: string;
      fieldErrors?: Record<string, string[]>;
      values?: Record<string, string>;
    };
