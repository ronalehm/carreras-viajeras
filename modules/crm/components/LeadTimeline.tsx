import { formatDateTime } from "@/lib/dates";
import type { LeadActivity, LeadSource } from "../types/leads.types";
import {
  LEAD_ACTIVITY_LABELS,
  LEAD_CHANNEL_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_LABELS,
  SYSTEM_ACTOR_LABELS,
  UNASSIGNED_OWNER_LABEL,
} from "../utils/leadDisplay";

type LeadTimelineProps = {
  activities: LeadActivity[];
  // Entry path of the lead: author of its created activity when it has none (system lead).
  leadSource: LeadSource;
};

// "Etapa: Nuevo → Contactado", "Responsable: Sin asignar → b@…", "Origen: Desconocido → Instagram"
// or the type label ("Pidió no seguir").
function activityTitle(activity: LeadActivity): string {
  const label = LEAD_ACTIVITY_LABELS[activity.type];
  if (activity.type === "stage_changed" && activity.stageFrom && activity.stageTo) {
    return `${label}: ${LEAD_STAGE_LABELS[activity.stageFrom]} → ${LEAD_STAGE_LABELS[activity.stageTo]}`;
  }
  if (activity.type === "owner_changed") {
    const from = activity.ownerFrom?.email ?? UNASSIGNED_OWNER_LABEL;
    const to = activity.ownerTo?.email ?? UNASSIGNED_OWNER_LABEL;
    return `${label}: ${from} → ${to}`;
  }
  if (activity.type === "channel_changed" && activity.channelFrom && activity.channelTo) {
    return `${label}: ${LEAD_CHANNEL_LABELS[activity.channelFrom]} → ${LEAD_CHANNEL_LABELS[activity.channelTo]}`;
  }
  return label;
}

// Only system activities have no author: n8n (automation), the web form (re_registered, whatever
// the lead's entry path) and the creation of a system lead, shown as its entry path
// ("Formulario web", "Google Forms", "Importación").
function activityAuthor(activity: LeadActivity, leadSource: LeadSource): string {
  if (activity.actor) return activity.actor.email;
  if (activity.type === "automation" || activity.type === "re_registered") {
    return SYSTEM_ACTOR_LABELS[activity.type];
  }
  return LEAD_SOURCE_LABELS[leadSource];
}

// Presentation only: the history arrives newest first and is never edited.
export function LeadTimeline({ activities, leadSource }: LeadTimelineProps) {
  if (activities.length === 0) {
    return <p className="text-muted-foreground">Sin seguimiento todavía.</p>;
  }

  return (
    <ol className="flex flex-col gap-4">
      {activities.map((activity) => (
        <li key={activity.id} className="flex flex-col gap-1 border-l-2 border-border pl-4">
          <p className="font-medium break-words">{activityTitle(activity)}</p>
          {activity.body && <p className="break-words whitespace-pre-line">{activity.body}</p>}
          <p className="text-sm text-muted-foreground">
            <span className="break-words">{activityAuthor(activity, leadSource)}</span>
            {" · "}
            <time dateTime={activity.createdAt.toISOString()}>{formatDateTime(activity.createdAt)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}
