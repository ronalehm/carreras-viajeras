import { z } from "zod";
import { blankToNull, leadChannelSchema } from "./leads.schema";

const CODE_MESSAGE = "El código debe tener de 3 a 32 caracteres: minúsculas, números y guiones.";
const NAME_MESSAGE = "Escribe un nombre de 2 a 80 caracteres.";
const TRIP_MESSAGE = "Elige un viaje del catálogo.";
const EVENT_MESSAGE = "El evento o stand debe tener entre 2 y 120 caracteres.";

// Short public code of a campaign (?c=): same rule as campaigns_code_chk in lib/db-schema.ts.
// Also used to normalize the ?c= parameter of the web capture (leadAttribution.ts).
export const campaignCodeSchema = z
  .string({ error: CODE_MESSAGE })
  .trim()
  .toLowerCase()
  .min(3, CODE_MESSAGE)
  .max(32, CODE_MESSAGE)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, CODE_MESSAGE);

// Any lead origin except "unknown" (campaigns_channel_chk): a campaign always knows its channel.
export const campaignChannelSchema = leadChannelSchema.exclude(["unknown"], { error: "Elige el canal." });

// New campaign form. Input: the strings of Object.fromEntries(formData). z.object drops unknown
// keys (status, createdBy, closedAt…): the status starts as 'active' and the author is the session
// user.
export const campaignFormSchema = z.object({
  code: campaignCodeSchema,
  name: z.string({ error: NAME_MESSAGE }).trim().min(2, NAME_MESSAGE).max(80, NAME_MESSAGE),
  tripId: z.uuid({ error: TRIP_MESSAGE }),
  channel: campaignChannelSchema,
  eventName: blankToNull(z.string().min(2, EVENT_MESSAGE).max(120, EVENT_MESSAGE)),
});

export const campaignIdSchema = z.uuid({ error: "La campaña no es válida." });
