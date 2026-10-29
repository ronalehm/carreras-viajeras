import type {
  LeadActivity,
  LeadDetail,
  LeadEmailStatus,
  LeadPipelineItem,
  LeadStage,
} from "../types/leads.types";
import { CLOSED_LEAD_STAGES } from "./leadDisplay";

export const PIPELINE_STAGES: readonly LeadStage[] = [
  "new",
  "contacted",
  "quoted",
  "reserved",
  "paid",
];
type GuidanceLead = Pick<
  LeadPipelineItem,
  "stage" | "owner" | "email" | "contactOptOutAt" | "nextActionDate"
> & {
  archivedAt?: Date | null;
  emailStatus?: LeadPipelineItem["emailStatus"];
};
export type LeadAlert = {
  code: string;
  title: string;
  detail: string;
  tone: "warning" | "info";
};

export function getLeadAlerts(lead: GuidanceLead, today: string): LeadAlert[] {
  if (lead.contactOptOutAt)
    return [
      {
        code: "opted_out",
        title: "No contactar",
        detail:
          "Pidió no recibir más mensajes. No se programan nuevos envíos ni seguimientos.",
        tone: "warning",
      },
    ];
  if (lead.archivedAt)
    return [
      {
        code: "archived",
        title: "Archivado",
        detail: "Este contacto es de solo lectura. No se programan envíos.",
        tone: "info",
      },
    ];
  const alerts: LeadAlert[] = [];
  const mail = lead.emailStatus?.stage === lead.stage ? lead.emailStatus : null;
  if (mail?.status === "unknown")
    alerts.push({
      code: "email_unknown",
      title: "Envío por confirmar",
      detail:
        "Revisa la ejecución de n8n antes de resolver este intento. No se reenvía mientras su resultado sea incierto.",
      tone: "warning",
    });
  if (mail?.status === "failed")
    alerts.push({
      code: "email_failed",
      title: "Revisar correo",
      detail:
        mail.lastErrorCode === "attempts_exhausted"
          ? "Se alcanzó el límite de intentos previos al envío. Revisa la integración de n8n."
          : "Se registró un fallo anterior al envío SMTP. Revisa el historial y corrige el problema antes de reintentar.",
      tone: "warning",
    });
  if (mail?.status === "skipped" && mail.lastErrorCode === "ineligible")
    alerts.push({
      code: "email_skipped",
      title: "Correo omitido",
      detail:
        "Los datos o la elegibilidad del contacto cambiaron antes de enviar. Consulta el historial del correo.",
      tone: "info",
    });
  const open = !CLOSED_LEAD_STAGES.includes(lead.stage);
  if (open && lead.nextActionDate && lead.nextActionDate < today)
    alerts.push({
      code: "overdue",
      title: "Seguimiento vencido",
      detail:
        "La fecha acordada ya pasó. Revisa la próxima acción con el responsable.",
      tone: "warning",
    });
  if (open && !lead.owner)
    alerts.push({
      code: "unassigned",
      title: "Sin responsable",
      detail: "Asigna una persona del equipo para continuar el seguimiento.",
      tone: "info",
    });
  if (open && lead.owner && !lead.owner.active)
    alerts.push({
      code: "inactive_owner",
      title: "Responsable sin acceso",
      detail:
        "El responsable perdió el acceso al CRM. Asigna una persona con acceso.",
      tone: "warning",
    });
  if (open && lead.nextActionDate === today)
    alerts.push({
      code: "today",
      title: "Seguimiento para hoy",
      detail: "Hay una próxima acción programada para hoy.",
      tone: "info",
    });
  if (open && !lead.nextActionDate)
    alerts.push({
      code: "no_action",
      title: "Sin próxima acción",
      detail: "Define una fecha y una acción para dar continuidad al contacto.",
      tone: "info",
    });
  if (!lead.email)
    alerts.push({
      code: "no_email",
      title: "Sin correo electrónico",
      detail:
        "No se puede enviar correo automático sin una dirección registrada.",
      tone: "info",
    });
  return alerts;
}

export const LEAD_EMAIL_STATUS_LABELS: Record<LeadEmailStatus, string> = {
  pending: "Pendiente",
  claimed: "En proceso",
  sending: "En proceso",
  sent: "Enviado",
  failed: "Con error",
  skipped: "Omitido",
  unknown: "Por confirmar",
};
export function leadEmailErrorText(code: string | null): string | null {
  if (!code) return null;
  const messages: Record<string, string> = {
    opted_out: "El contacto pidió no recibir más mensajes.",
    archived: "El contacto está archivado.",
    bulk_import: "Importación excluida de los envíos automáticos.",
    obsolete_event: "El contacto pasó a otra etapa antes de enviar.",
    missing_email: "No había un correo válido registrado.",
    ineligible:
      "El contacto, el correo o la configuración cambiaron antes de enviar.",
    smtp_unknown:
      "Resultado SMTP incierto. Revisa la ejecución de n8n; no reenvíes este mensaje a ciegas.",
    pre_send_failed:
      "Fallo confirmado antes de iniciar SMTP. Corrige el problema antes de reintentar.",
    attempts_exhausted:
      "Se alcanzó el límite de tres intentos previos al envío.",
  };
  return messages[code] ?? "Revisa el resultado de la integración de correo.";
}

const NEXT_STEPS: Record<LeadStage, string> = {
  new: "Asignar responsable y preparar el primer contacto.",
  contacted: "Aclarar el interés y acordar una propuesta.",
  quoted: "Resolver dudas y definir el próximo seguimiento.",
  reserved: "Coordinar los siguientes pasos de la reserva.",
  paid: "Revisar la reserva y las coordinaciones del viaje.",
  lost: "Consultar el motivo del cierre y respetar las preferencias de contacto.",
};
export function getLeadNextStep(
  lead: Pick<LeadDetail, "stage" | "contactOptOutAt" | "archivedAt">,
): string {
  if (lead.contactOptOutAt)
    return "Se mantiene la baja de contacto. No se programan nuevos mensajes.";
  if (lead.archivedAt)
    return "Consulta el recorrido y el historial de este contacto archivado.";
  return NEXT_STEPS[lead.stage];
}

// Current stage never implies that earlier stages were visited. Includes opted_out transitions.
export function getJourneyStages(
  current: LeadStage,
  activities: LeadActivity[],
) {
  const visited = new Set(
    activities
      .flatMap((item) => [item.stageFrom, item.stageTo])
      .filter(Boolean),
  );
  return [...PIPELINE_STAGES, "lost" as const].map((stage) => ({
    stage,
    state:
      stage === current
        ? "current"
        : visited.has(stage)
          ? "visited"
          : "unknown",
  }));
}
