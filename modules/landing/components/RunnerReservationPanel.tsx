"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCheckoutAccess } from "../hooks/useCheckoutAccess";
import type { OfferView } from "../utils/catalogOffer";

const STEPS = [
  "Elige pago completo o un pago inicial.",
  "Revisa el importe en soles y acepta tu contrato.",
  "Paga con tarjeta y recibe la confirmación en Mis carreras.",
];

/**
 * Right column of the registration page for a signed-in runner: the account already exists, so
 * the lead form gives way to the reservation. The server decides per request whether this account
 * may pay online; otherwise the runner is pointed to WhatsApp.
 */
export function RunnerReservationPanel({ href, offer, whatsAppUrl }: {
  href?: string; offer: OfferView | null; whatsAppUrl: string | null;
}) {
  const { data: available, isPending } = useCheckoutAccess();
  const firstDeposit = offer?.deposits[0]?.deposit;

  return (
    <div className="flex flex-col gap-5">
      {offer && (
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Asegura tu lugar hoy</p>
          <p className="display-title text-4xl leading-none text-primary">
            {firstDeposit ? <>Desde {firstDeposit}</> : offer.finalPrice}
          </p>
          {firstDeposit && <p className="mt-1 text-sm">Precio final {offer.finalPrice}. El pago inicial se descuenta.</p>}
        </div>
      )}
      <ol className="grid gap-3">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {index + 1}
            </span>
            <span className="pt-1">{step}</span>
          </li>
        ))}
      </ol>
      {isPending ? (
        <p role="status" className="text-sm text-muted-foreground">Preparando tu reserva…</p>
      ) : available === true && href ? (
        <Link
          href={href}
          className={cn(
            buttonVariants(),
            "h-auto w-full gap-2 rounded-full bg-highlight px-6 py-3.5 text-base font-semibold text-night hover:bg-primary hover:text-primary-foreground",
          )}
        >
          Reservar mi lugar <ArrowUpRight aria-hidden />
        </Link>
      ) : (
        <div className="grid gap-3 text-sm">
          <p>La reserva en línea aún no está habilitada para tu cuenta. Escríbenos y te ayudamos a reservar.</p>
          {whatsAppUrl && (
            <a href={whatsAppUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }), "w-full rounded-full")}>
              Escribir por WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );
}
