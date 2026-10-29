import { formatCalendarDate, formatDateTime } from "@/lib/dates";
import type { RewardCatalogItem, RewardRule } from "../types/rewards.types";

export function rewardMoney(amount: number) { return `US$ ${new Intl.NumberFormat("es", { maximumFractionDigits: 0 }).format(amount)}`; }
export function rewardInstant(value: string) { return formatDateTime(new Date(value)); }

export function RewardRuleDetails({ rule }: { rule: RewardRule }) {
  return <div className="grid gap-2 text-sm">
    <p>Regla v{rule.version}: {rule.pointsPerReferral} estrellas por referido elegible.</p>
    <p>Vigente desde {formatCalendarDate(rule.validFrom)}{rule.validUntil ? ` hasta ${formatCalendarDate(rule.validUntil)}` : "; sin fecha final"}. Fechas de Lima.</p>
    <p>{rule.maxReferralsPerRunner === null ? "Sin límite configurado de referidos por runner." : `Máximo ${rule.maxReferralsPerRunner} referidos por runner.`}</p>
    <p className="whitespace-pre-wrap">{rule.terms}</p>
  </div>;
}

export function RewardCatalogDetails({ item }: { item: RewardCatalogItem }) {
  return <div className="grid gap-2 text-sm">
    <p className="whitespace-pre-wrap">{item.description}</p>
    <p>{item.costStars} estrellas · {item.kind === "discount" && item.discountUsd !== null ? `Descuento de ${rewardMoney(item.discountUsd)}` : "Beneficio no monetario"}</p>
    <p>Máximo {item.maxPerRunner} canjes por runner entre las versiones del premio. El canje vence a los {item.redemptionDays} días de su emisión.</p>
    <p>{item.stock === null ? "Sin tope de unidades configurado." : `Tope del premio entre sus versiones: ${item.stock} unidades. La disponibilidad se comprueba al canjear.`}</p>
    <p>Desde {formatCalendarDate(item.validFrom)}{item.validUntil ? ` hasta ${formatCalendarDate(item.validUntil)}` : "; sin fecha final"}. Fechas de Lima.</p>
  </div>;
}
