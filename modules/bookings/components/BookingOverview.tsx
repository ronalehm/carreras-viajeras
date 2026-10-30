import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl, WHATSAPP_NUMBER } from "@/modules/landing";
import { formatTripDate, formatTripDateRange, formatTripPrice } from "@/modules/trips";
import type { RunnerBookingDetail } from "../types/bookings.types";
import { formatShortDate } from "../utils/bookingDisplay";
import { getPaymentSummary, isTripFinished } from "../utils/runnerBookings";
import { BookingStatusBadge } from "./BookingTable";

const SECTION_TITLE = "mb-4 text-xs font-bold tracking-[0.2em] uppercase";
const LINK = "inline-flex items-center gap-0.5 font-bold underline underline-offset-4";

/**
 * The portal's only WhatsApp link. Without a configured number it renders nothing, or just the label when
 * `plainFallback` is set (inside a sentence that must keep reading).
 */
export function WhatsAppLink({
  text,
  children = "Escríbenos por WhatsApp",
  plainFallback = false,
}: {
  text: string;
  children?: string;
  plainFallback?: boolean;
}) {
  const href = buildWhatsAppUrl(WHATSAPP_NUMBER, text);
  if (!href) return plainFallback ? children : null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children} <ArrowUpRight aria-hidden className="size-3.5" />
    </a>
  );
}

/**
 * Trip heading and booking state. "Tu paquete" and "Pagos" are separate exports so the page grid can place
 * them in the side column while keeping the mobile reading order (heading, notices, timeline, package, payments).
 */
export function BookingOverview({
  detail,
  today,
  className,
}: {
  detail: Pick<RunnerBookingDetail, "status" | "trip">;
  today: string;
  className?: string;
}) {
  const { trip, status } = detail;
  const cancelled = status === "cancelled";
  const finished = !cancelled && isTripFinished(trip, today);

  return (
    <section aria-labelledby="booking-trip-title" className={cn("space-y-3 text-primary", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h2 id="booking-trip-title" className="display-title text-3xl leading-none lg:text-4xl">
          {trip.title}
        </h2>
        <div className="flex flex-wrap gap-2">
          {finished ? (
            <Badge variant="outline" className="border-highlight bg-highlight/15">
              Viaje terminado
            </Badge>
          ) : (
            <BookingStatusBadge status={status} />
          )}
        </div>
      </div>
      <div className="space-y-0.5 text-sm">
        <p className="font-bold">
          {trip.city}, {trip.country}
        </p>
        <p>
          Carrera: <time dateTime={trip.raceDate}>{formatTripDate(trip.raceDate)}</time>
        </p>
        {trip.startDate && trip.endDate && <p>Viaje: {formatTripDateRange(trip.startDate, trip.endDate)}</p>}
      </div>

      {status === "pending" && (
        <Alert role="status">
          <AlertDescription>
            Tu reserva está pendiente de confirmación. Te avisaremos cuando el equipo la confirme; los datos
            pueden cambiar.
          </AlertDescription>
        </Alert>
      )}
      {finished && (
        <div className="space-y-2 text-sm">
          <p>Gracias por correr con nosotros.</p>
          <Link href="/#destinos" className={LINK}>
            Explorar próximas experiencias <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        </div>
      )}
      {cancelled && (
        <p className="text-sm">
          Esta reserva fue cancelada. Si tienes dudas,{" "}
          <WhatsAppLink text={`Hola, tengo una consulta sobre mi reserva de ${trip.title}.`} plainFallback>
            escríbenos por WhatsApp
          </WhatsAppLink>
          .
        </p>
      )}
    </section>
  );
}

export function BookingPackage({
  detail,
  className,
}: {
  detail: Pick<RunnerBookingDetail, "packageLabel" | "distance" | "trip">;
  className?: string;
}) {
  const { includes } = detail.trip;
  return (
    <section aria-labelledby="booking-package-title" className={cn("text-primary", className)}>
      <h2 id="booking-package-title" className={SECTION_TITLE}>
        Tu paquete
      </h2>
      <p className="font-bold">
        {detail.packageLabel}
        {detail.distance && <> · {detail.distance}</>}
      </p>
      {includes.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-bold">Qué incluye ({includes.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-right font-bold">{children}</dd>
    </div>
  );
}

export function BookingPayments({
  detail,
  className,
}: {
  detail: Pick<RunnerBookingDetail, "totalUsd" | "paidUsd" | "paymentInReview" | "payments" | "balanceDueOn">;
  className?: string;
}) {
  const summary = getPaymentSummary(detail.totalUsd, detail.paidUsd, detail.balanceDueOn);
  return (
    <section aria-labelledby="booking-payments-title" className={cn("text-primary", className)}>
      <h2 id="booking-payments-title" className={SECTION_TITLE}>
        Pagos
      </h2>
      <dl className="space-y-1.5 text-sm">
        <Row label="Total acordado">{formatTripPrice(summary.totalUsd)}</Row>
        <Row label="Pagado">{formatTripPrice(summary.paidUsd)}</Row>
        {summary.balanceUsd > 0 && <Row label="Saldo pendiente">{formatTripPrice(summary.balanceUsd)}</Row>}
        {summary.balanceUsd === 0 && <Row label="Saldo">Pagado por completo</Row>}
        {summary.balanceUsd < 0 && <Row label="Saldo a favor">{formatTripPrice(-summary.balanceUsd)}</Row>}
        {summary.dueOn && (
          <Row label="Fecha límite">
            <time dateTime={summary.dueOn}>{formatShortDate(summary.dueOn)}</time>
          </Row>
        )}
      </dl>
      {detail.paymentInReview && (
        <Alert role="status" className="mt-3">
          <AlertTitle>Pago en revisión</AlertTitle>
          <AlertDescription>
            Estamos verificando un pago con tarjeta. Aún no se refleja en tu saldo; te avisaremos cuando quede
            confirmado.
          </AlertDescription>
        </Alert>
      )}
      {detail.payments.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-bold">Pagos confirmados ({detail.payments.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {detail.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap justify-between gap-x-4">
                <span>
                  <time dateTime={payment.paidOn}>{formatShortDate(payment.paidOn)}</time> · {payment.concept}
                </span>
                <span className="font-bold">{formatTripPrice(payment.amountUsd)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
