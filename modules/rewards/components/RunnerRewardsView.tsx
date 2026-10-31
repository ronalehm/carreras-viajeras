import Link from "next/link";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { cancelRedemptionAction, claimReferralAction, requestRedemptionAction } from "../actions/rewards.actions";
import type { OwnReferrals, OwnRewards } from "../types/rewards.types";
import { ReferralCode } from "./ReferralCode";
import { RewardCatalogDetails, RewardRuleDetails, rewardInstant, rewardMoney } from "./RewardDetails";
import { RewardMutationForm } from "./RewardMutationForm";

const REDEMPTION_LABELS = { available: "Disponible para aplicar", applied: "Utilizado", cancelled: "Cancelado", expired: "Vencido" };
const REFERRAL_LABELS = { pending: "Pendiente del hito de reserva confirmada y primer pago válido", credited: "Estrellas acreditadas", reversed: "Acreditación revertida" };

export function RunnerRewardsView({ rewards, referrals, referralUrl }: { rewards: OwnRewards; referrals: OwnReferrals; referralUrl?: string }) {
  return <>
    <section id="beneficios" aria-labelledby="benefits-heading" className="grid scroll-mt-24 gap-5 rounded-2xl border p-5 sm:p-7">
      <h2 id="benefits-heading" className="text-xl font-semibold">Beneficios y recompensas</h2>
      <p className="text-sm text-muted-foreground">Tus ventajas contratadas y tus canjes personales, con sus condiciones.</p>
      <div className="grid gap-3"><h3 className="font-semibold">Beneficios de tus reservas</h3>
        {rewards.benefits.length === 0 ? <p className="text-sm text-muted-foreground">No hay beneficios registrados en tus reservas.</p> : rewards.benefits.map((benefit) => <article key={benefit.id} className="grid gap-2 rounded-xl border p-4">
          <h4 className="font-medium">{benefit.title}</h4><p className="text-sm">{benefit.tripTitle}{benefit.bookingStatus === "cancelled" ? " · Reserva cancelada: registro histórico" : ""}</p>
          <p className="whitespace-pre-wrap text-sm">{benefit.description}</p>
          {benefit.discountUsd !== null && <p className="text-sm">Descuento registrado: {rewardMoney(benefit.discountUsd)}.</p>}
          <Link href={`/mis-carreras?reserva=${encodeURIComponent(benefit.bookingId)}`} className="text-sm underline">Ver reserva</Link>
        </article>)}
      </div>
      <div className="grid gap-3"><h3 className="font-semibold">Catálogo de premios</h3>
        <p className="text-sm">Saldo disponible: <strong>{rewards.balance} estrellas</strong>. Las estrellas no son dinero.</p>
        {!rewards.activeRule && <p className="text-sm text-muted-foreground">El programa no está activo para nuevos canjes.</p>}
        {rewards.reviewRequired && <p role="alert" className="text-sm text-destructive">Hay un ajuste pendiente de revisión. Los nuevos canjes están bloqueados; contacta con el equipo.</p>}
        {rewards.catalog.length === 0 ? <p className="text-sm text-muted-foreground">No hay premios vigentes disponibles.</p> : <div className="grid gap-4 md:grid-cols-2">{rewards.catalog.map((item) => <article key={item.id} className="grid content-start gap-4 rounded-xl border p-4">
          <h4 className="font-medium">{item.title}</h4><RewardCatalogDetails item={item} />
          <RewardMutationForm action={requestRedemptionAction} hidden={{ catalogVersionId: item.id }} label="Canjear estrellas" idempotent disabled={!rewards.activeRule || rewards.reviewRequired || rewards.balance < item.costStars} />
          {!rewards.reviewRequired && rewards.balance < item.costStars && <p className="text-sm text-muted-foreground">Necesitas {item.costStars - rewards.balance} estrellas más para este premio.</p>}
        </article>)}</div>}
      </div>
      <div className="grid gap-3"><h3 className="font-semibold">Tus canjes</h3>
        {rewards.redemptions.length === 0 ? <p className="text-sm text-muted-foreground">Aún no has solicitado canjes.</p> : rewards.redemptions.map((item) => <article key={item.id} className="grid gap-2 rounded-xl border p-4">
          <h4 className="font-medium">{item.title} · {REDEMPTION_LABELS[item.status]}</h4>
          <p className="whitespace-pre-wrap text-sm">{item.description}</p><p className="text-sm">{item.costStars} estrellas{item.discountUsd !== null ? ` · ${rewardMoney(item.discountUsd)} de descuento` : ""}.</p>
          <p className="text-sm">Emitido: {rewardInstant(item.createdAt)}. Vence: {rewardInstant(item.expiresAt)}.</p>
          {item.appliedAt && <p className="text-sm">Utilizado: {rewardInstant(item.appliedAt)}.</p>}
          {item.status === "available" && <><p className="text-sm text-muted-foreground">Coordina con el equipo la aplicación o entrega antes del vencimiento.</p><ConfirmActionButton action={cancelRedemptionAction} fields={{ id: item.id }} label="Cancelar canje" title="Cancelar este canje" description="El canje dejará de estar disponible y se liberarán las estrellas correspondientes una sola vez." confirmLabel="Cancelar canje" variant="outline" /></>}
        </article>)}
        {rewards.redemptions.length === 100 && <p className="text-sm text-muted-foreground">Se muestran los 100 canjes más recientes.</p>}
      </div>
    </section>
    <section id="referidos" aria-labelledby="referrals-heading" className="grid scroll-mt-24 gap-5 rounded-2xl border p-5 sm:p-7">
      <h2 id="referrals-heading" className="text-xl font-semibold">Referidos y estrellas</h2>
      <p className="text-sm">Las estrellas se acreditan cuando el referido confirma una reserva y registra su primer pago positivo no anulado. Una cancelación o anulación puede revertirlas.</p>
      {rewards.activeRule ? <div className="grid gap-3"><h3 className="font-semibold">Condiciones para nuevas atribuciones</h3><RewardRuleDetails rule={rewards.activeRule} /></div> : <p className="text-sm text-muted-foreground">No hay una regla vigente para aceptar nuevos referidos.</p>}
      {referrals.code && rewards.activeRule && <ReferralCode code={referrals.code} url={referralUrl} />}
      <p className="text-sm text-muted-foreground">Compartir el enlace no atribuye el referido. La otra persona debe verificar su cuenta, introducir el código y aceptar las condiciones. Tú eliges cómo compartirlo.</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt>Pendientes</dt><dd className="font-semibold">{referrals.counts.pending}</dd></div><div><dt>Acreditados</dt><dd className="font-semibold">{referrals.counts.credited}</dd></div><div><dt>Revertidos</dt><dd className="font-semibold">{referrals.counts.reversed}</dd></div></dl>
      <div className="grid gap-3"><h3 className="font-semibold">¿Te refirió otro runner?</h3>
        {referrals.attribution ? <><p className="text-sm">Tu atribución: {REFERRAL_LABELS[referrals.attribution.status]}.</p><h4 className="text-sm font-medium">Condiciones que aceptaste</h4><RewardRuleDetails rule={referrals.attribution.rule} /></> : rewards.activeRule ? <RewardMutationForm action={claimReferralAction} hidden={{ ruleVersionId: rewards.activeRule.id }} label="Aceptar código de referido" fields={[
          { name: "code", label: "Código de quien te refirió", required: true },
          { name: "consent", label: "Acepto las condiciones de esta atribución y la regla vigente mostrada arriba.", type: "checkbox", required: true, hint: "Esta aceptación no te suscribe a comunicaciones comerciales." },
        ]} /> : null}
      </div>
      <div className="grid gap-3"><h3 className="font-semibold">Movimientos de estrellas</h3>
        {rewards.ledger.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay movimientos.</p> : <ul className="grid gap-3 sm:grid-cols-2">{rewards.ledger.map((entry) => <li key={entry.id} className="rounded-xl border p-4 text-sm"><p>{entry.description}</p><p className="font-medium">{entry.delta > 0 ? "+" : ""}{entry.delta} estrellas</p><p className="text-muted-foreground">{rewardInstant(entry.createdAt)}</p></li>)}</ul>}
        {rewards.ledger.length === 100 && <p className="text-sm text-muted-foreground">Se muestran los 100 movimientos más recientes.</p>}
      </div>
    </section>
  </>;
}
