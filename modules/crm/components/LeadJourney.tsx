import { ArrowRight, Check, History, TriangleAlert } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { LeadActivity, LeadDetail } from "../types/leads.types";
import { LEAD_STAGE_LABELS } from "../utils/leadDisplay";
import {
  getJourneyStages,
  getLeadAlerts,
  getLeadNextStep,
} from "../utils/leadGuidance";

function StageBadge({
  stage,
  state,
}: ReturnType<typeof getJourneyStages>[number]) {
  return (
    <li
      className={cn(
        "rounded-xl border px-3 py-2 text-xs",
        state === "current"
          ? "border-primary/20 bg-primary/7 font-medium text-primary"
          : state === "visited"
            ? "bg-muted"
            : "border-dashed text-muted-foreground",
      )}
    >
      {state === "visited" && (
        <Check aria-hidden="true" className="mr-1 inline size-3" />
      )}
      {LEAD_STAGE_LABELS[stage]} ·{" "}
      {state === "current"
        ? "Actual"
        : state === "visited"
          ? "Visitada"
          : "Sin registro"}
    </li>
  );
}

export function LeadJourney({
  lead,
  activities,
  today,
}: {
  lead: LeadDetail;
  activities: LeadActivity[];
  today: string;
}) {
  const alerts = getLeadAlerts(lead, today);
  const journey = getJourneyStages(lead.stage, activities);
  const transitions = activities
    .filter((item) => item.stageFrom && item.stageTo)
    .slice()
    .reverse();
  return (
    <section
      aria-label="Recorrido y avisos"
      className="grid min-w-0 gap-5 lg:grid-cols-2"
    >
      <div className="min-w-0 rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <History aria-hidden="true" className="size-4 text-primary" />
          Recorrido registrado
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Solo se marcan las etapas presentes en el historial. Perdido es una
          salida desde cualquier etapa.
        </p>
        <ol
          aria-label="Etapas principales"
          className="mt-4 flex flex-wrap gap-2"
        >
          {journey
            .filter((item) => item.stage !== "lost")
            .map((item) => (
              <StageBadge key={item.stage} {...item} />
            ))}
        </ol>
        <div className="mt-4 border-t border-dashed pt-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Salida del embudo
          </p>
          <ul aria-label="Salidas del embudo" className="flex flex-wrap gap-2">
            {journey
              .filter((item) => item.stage === "lost")
              .map((item) => (
                <StageBadge key={item.stage} {...item} />
              ))}
          </ul>
        </div>
        <ol aria-label="Transiciones registradas" className="mt-5 space-y-4">
          {transitions.map((item) => (
            <li key={item.id} className="border-l-2 border-primary/20 pl-3">
              <p className="text-sm font-medium">
                {LEAD_STAGE_LABELS[item.stageFrom!]}
                <span className="sr-only"> a </span>
                <ArrowRight aria-hidden="true" className="mx-1 inline size-3" />
                {LEAD_STAGE_LABELS[item.stageTo!]}
              </p>
              <p className="mt-1 text-xs leading-5 break-words text-muted-foreground">
                <time dateTime={item.createdAt.toISOString()}>
                  {formatDateTime(item.createdAt)}
                </time>{" "}
                · {item.actor?.email ?? "Sistema"}
              </p>
              {item.body && (
                <p className="mt-1 text-xs break-words text-muted-foreground">
                  {item.body}
                </p>
              )}
            </li>
          ))}
        </ol>
        {transitions.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Aún no hay cambios de etapa registrados.
          </p>
        )}
      </div>
      <div className="min-w-0 rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">Qué sigue</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {getLeadNextStep(lead)}
        </p>
        {lead.stage === "lost" && lead.lostReason && (
          <p className="mt-3 text-sm break-words">Motivo: {lead.lostReason}</p>
        )}
        <ul className="mt-5 space-y-3">
          {alerts.map((alert) => (
            <li
              key={alert.code}
              className={cn(
                "rounded-xl p-4",
                alert.tone === "warning"
                  ? "bg-destructive/8 text-destructive"
                  : "bg-primary/7 text-primary",
              )}
            >
              <h3 className="text-sm font-medium">
                <TriangleAlert
                  aria-hidden="true"
                  className="mr-2 inline size-4"
                />
                {alert.title}
              </h3>
              <p className="mt-2 text-xs leading-6">{alert.detail}</p>
            </li>
          ))}
        </ul>
        {alerts.length === 0 && (
          <p className="mt-5 text-sm text-muted-foreground">
            Sin avisos de seguimiento pendientes.
          </p>
        )}
      </div>
    </section>
  );
}
