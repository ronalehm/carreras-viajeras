import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { applyRewardAction, assignBookingBenefitAction, fulfillRewardAction } from "../actions/rewards.actions";
import { getBookingRewardOptions } from "../services/rewards.service";
import { RewardMutationForm } from "./RewardMutationForm";
import { rewardInstant, rewardMoney } from "./RewardDetails";

export async function BookingRewardsPanel({ bookingId, canManage }: { bookingId: string; canManage: boolean }) {
  let options;
  let mayManage;
  try {
    const actor = await requirePermission("rewards.apply");
    mayManage = canManage && can(actor.staffRoles, "rewards.manage");
    options = await getBookingRewardOptions(bookingId);
  } catch {
    return <section className="grid gap-3 rounded-xl border p-5"><h2 className="text-lg font-semibold">Beneficios y recompensas</h2><p role="alert">No se pudieron cargar los beneficios de la reserva.</p></section>;
  }
  return <section className="grid gap-5 rounded-xl border p-5" aria-labelledby="booking-rewards-heading">
    <h2 id="booking-rewards-heading" className="text-lg font-semibold">Beneficios y recompensas</h2>
    {!options.linked ? <p className="text-sm text-muted-foreground">La reserva debe estar vinculada a la cuenta verificada del runner para registrar beneficios o aplicar sus recompensas.</p> : <>
      <div className="grid gap-3"><h3 className="font-medium">Beneficios registrados</h3>
        {options.benefits.length === 0 ? <p className="text-sm text-muted-foreground">No hay beneficios registrados. Revisa la evidencia de lo contratado antes de asignar uno.</p> : options.benefits.map((benefit) => <article key={benefit.id} className="grid gap-2 rounded-lg border p-4"><h4 className="font-medium">{benefit.title}{benefit.bookingStatus === "cancelled" ? " · Histórico: reserva cancelada" : ""}</h4><p className="whitespace-pre-wrap text-sm">{benefit.description}</p>{benefit.discountUsd !== null && <p className="text-sm">Descuento: {rewardMoney(benefit.discountUsd)}.</p>}</article>)}
      </div>
      <div className="grid gap-3"><h3 className="font-medium">Canjes disponibles del runner</h3>
        <p className="text-sm text-muted-foreground">Un descuento requiere la misma cuenta, reserva pendiente y sin pagos. No se acumulan descuentos. Se comprueba de nuevo al aplicar.</p>
        {options.redemptions.length === 0 ? <p className="text-sm text-muted-foreground">No hay canjes disponibles para aplicar.</p> : options.redemptions.map((item) => <article key={item.id} className="grid gap-3 rounded-lg border p-4">
          <h4 className="font-medium">{item.title}</h4><p className="whitespace-pre-wrap text-sm">{item.description}</p><p className="text-sm">{item.costStars} estrellas{item.discountUsd !== null ? ` · ${rewardMoney(item.discountUsd)}` : ""}. Vence: {rewardInstant(item.expiresAt)}.</p>
          {item.kind === "discount" ? <RewardMutationForm action={applyRewardAction} hidden={{ bookingId, redemptionId: item.id }} label="Aplicar descuento a esta reserva" /> : <ConfirmActionButton action={fulfillRewardAction} fields={{ id: item.id }} label="Registrar entrega del beneficio" title="Confirmar entrega del beneficio" description="Confirma solo si el runner ha recibido el beneficio con las condiciones indicadas. El canje quedará utilizado." confirmLabel="Confirmar entrega" variant="outline" />}
        </article>)}
      </div>
      {mayManage && <div className="grid gap-3"><h3 className="font-medium">Registrar beneficio contractual</h3><p className="text-sm text-muted-foreground">Registra la evidencia y condiciones de lo contratado. Esta asignación no concede estrellas ni modifica el precio.</p><RewardMutationForm action={assignBookingBenefitAction} hidden={{ bookingId }} label="Registrar beneficio" fields={[{ name: "title", label: "Beneficio contratado", required: true }, { name: "description", label: "Evidencia y condiciones", type: "textarea", required: true }]} /></div>}
    </>}
  </section>;
}
