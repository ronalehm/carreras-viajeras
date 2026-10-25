import { formatDateTime } from "@/lib/dates";
import type { LeadActivity } from "../types/leads.types";
import {
  LEAD_ACTIVITY_LABELS,
  LEAD_STAGE_LABELS,
  SYSTEM_ACTOR_LABELS,
  UNASSIGNED_OWNER_LABEL,
} from "../utils/leadDisplay";

type LeadTimelineProps = {
  activities: LeadActivity[];
};

// "Etapa: Nuevo → Contactado", "Responsable: Sin asignar → b@…" or the type label.
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
  return label;
}

// Only system activities have no author: the web form (created) and n8n (automation).
function activityAuthor(activity: LeadActivity): string {
  if (activity.actor) return activity.actor.email;
  return activity.type === "automation" ? SYSTEM_ACTOR_LABELS.automation : SYSTEM_ACTOR_LABELS.created;
}

// Presentation only: the history arrives newest first and is never edited.
export function LeadTimeline({ activities }: LeadTimelineProps) {
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
            <span className="break-words">{activityAuthor(activity)}</span>
            {" · "}
            <time dateTime={activity.createdAt.toISOString()}>{formatDateTime(activity.createdAt)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}
