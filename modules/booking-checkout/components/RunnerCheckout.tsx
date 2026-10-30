"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { formatPenCents } from "@/lib/currency";
import type { OfferView } from "@/modules/landing/utils/catalogOffer";

type Prepared = {
  bookingId: string;
  quote: { totalUsd: number; principalUsd: number; balanceUsd: number; rateUsdPen: string };
  checkoutQuotes: {
    initial: { amountUsd: number; amountPenCents: number; quoteHash: string };
    balance: { amountUsd: number; amountPenCents: number; quoteHash: string } | null;
  };
  contract: { title: string; versionKey: string; testDocument: boolean };
  documentSnapshot: string;
  documentHash: string;
  resumed: boolean;
};
// Every error response of the checkout API is `{ code, requestId }`.
type ErrorBody = { code?: unknown; requestId?: unknown };
type Choice = { kind: "full" } | { kind: "deposit"; index: number };
function isPrepared(value: unknown): value is Prepared {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<Prepared>;
  return typeof result.bookingId === "string" && typeof result.documentHash === "string"
    && typeof result.documentSnapshot === "string" && Boolean(result.checkoutQuotes?.initial?.quoteHash)
    && Boolean(result.contract?.title);
}

const messages: Record<string, string> = {
  registration_required: "Regístrate primero con el mismo correo de tu cuenta para asociar tu reserva.",
  offer_unavailable: "La oferta ya no está disponible. Actualiza la página para ver la oferta vigente.",
  rate_unavailable: "No hay un tipo de cambio disponible en este momento.",
  contract_unavailable: "No hay un contrato disponible o habilitado para pruebas para esta versión de la oferta.",
  sold_out: "La oferta alcanzó su cupo.",
  document_changed: "El contrato cambió. Vuelve a revisar el documento.",
  reservation_expired: "La reserva venció. Inicia el proceso otra vez.",
  booking_exists: "Ya tienes una reserva para este viaje. Revísala en Mis carreras.",
  invalid_payment_choice: "La forma de pago elegida ya no está disponible. Elige otra opción.",
  attempt_expired: "La sesión de pago anterior venció. Vuelve a intentarlo para abrir una nueva.",
};

async function readError(response: Response): Promise<ErrorBody> {
  try { return await response.json() as ErrorBody; } catch { return {}; }
}
// The reference lets the team find the server log line of this exact failure.
function errorMessage(body: ErrorBody, fallback: string): string {
  const message = (typeof body.code === "string" && messages[body.code]) || fallback;
  return typeof body.requestId === "string" ? `${message} Referencia: ${body.requestId}.` : message;
}

export function RunnerCheckout({
  tripId, tripTitle, campaignCode, offer, returned, cancelled, bookingId, attemptId,
}: {
  tripId: string; tripTitle: string; campaignCode: string | null; offer: OfferView | null;
  returned: boolean; cancelled: boolean; bookingId: string | null; attemptId: string | null;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  const [choice, setChoice] = useState<Choice>({ kind: "full" });
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutState, setCheckoutState] = useState<{
    status: string; amountUsd: number; amountPenCents: number; checkoutUrl: string | null;
    balanceQuote: { amountUsd: number; amountPenCents: number; quoteHash: string } | null;
  } | null>(null);

  useEffect(() => {
    if (!bookingId || !attemptId) return;
    const controller = new AbortController();
    void fetch(`/api/bookings/${bookingId}/checkout/${attemptId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(errorMessage(await readError(response), "Inicia sesión con la cuenta de la reserva para consultar su estado."));
        }
        return response.json() as Promise<{ status: string; amountUsd: number; amountPenCents: number; checkoutUrl: string | null;
          balanceQuote: { amountUsd: number; amountPenCents: number; quoteHash: string } | null }>;
      })
      .then(setCheckoutState)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error && cause.message ? cause.message : "Inicia sesión con la cuenta de la reserva para consultar su estado.");
      });
    return () => controller.abort();
  }, [bookingId, attemptId]);

  const emailVerified = user?.primaryEmailAddress?.verification?.status === "verified";
  const accountUrl = "/cuenta";
  async function prepare() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/bookings/checkout/prepare", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId, campaignCode: campaignCode ?? undefined, paymentChoice: choice, requestId: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error(errorMessage(await readError(response), "No se pudo preparar la reserva."));
      const result: unknown = await response.json();
      if (!isPrepared(result)) throw new Error("La respuesta de preparación no es válida.");
      setPrepared(result); setAccepted(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo preparar la reserva."); }
    finally { setBusy(false); }
  }

  async function checkout() {
    if (!prepared || !accepted) return;
    setBusy(true); setError(null);
    try {
      const acceptedResponse = await fetch(`/api/bookings/${prepared.bookingId}/contract-acceptance`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ accepted: true, documentHash: prepared.documentHash }),
      });
      if (!acceptedResponse.ok) throw new Error(errorMessage(await readError(acceptedResponse), "No se pudo registrar la aceptación del contrato."));

      const quote = prepared.checkoutQuotes.initial;
      const response = await fetch(`/api/bookings/${prepared.bookingId}/checkout`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), kind: "initial", quoteHash: quote.quoteHash }),
      });
      if (!response.ok) throw new Error(errorMessage(await readError(response), "No se pudo iniciar el pago. Puedes volver a intentarlo."));
      const result = await response.json() as { checkoutUrl?: unknown };
      if (typeof result.checkoutUrl !== "string") throw new Error("No se pudo iniciar el pago. Puedes volver a intentarlo.");
      window.location.assign(result.checkoutUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo iniciar el pago."); setBusy(false); }
  }

  async function checkoutBalance() {
    if (!bookingId || !checkoutState?.balanceQuote) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/checkout`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), kind: "balance", quoteHash: checkoutState.balanceQuote.quoteHash }),
      });
      if (!response.ok) throw new Error(errorMessage(await readError(response), "No se pudo iniciar el pago del saldo."));
      const result = await response.json() as { checkoutUrl?: unknown };
      if (typeof result.checkoutUrl !== "string") throw new Error("No se pudo iniciar el pago del saldo.");
      window.location.assign(result.checkoutUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo iniciar el pago del saldo."); setBusy(false); }
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 text-night">
      <div>
        <p className="text-sm font-semibold tracking-wide text-muted-foreground">CARRERAS VIAJERAS · CHECKOUT SANDBOX</p>
        <h1 className="mt-2 text-3xl font-bold">{tripTitle}</h1>
        <p className="mt-2">La reserva se mantiene pendiente hasta que Stripe confirme el pago mediante webhook.</p>
        <p className="mt-2 text-sm">Solo aceptamos tarjetas. El pago se completa en Stripe.</p>
      </div>
      {(returned || cancelled) && (
        <div role="status" className="rounded-lg bg-sky p-4">
          {checkoutState?.status === "paid" ? "Pago confirmado por el webhook de Stripe." : null}
          {checkoutState?.status === "paid" && <p className="mt-3"><Link className="font-semibold underline" href="/mis-carreras">Ver mi reserva</Link></p>}
          {checkoutState?.status === "needs_review" ? "Stripe informa un pago que requiere revisión. No inicies otro pago." : null}
          {checkoutState?.status === "created" ? "El pago todavía no está confirmado por el servidor." : null}
          {checkoutState?.status === "pending" ? "La reserva está pendiente de pago." : null}
          {checkoutState?.status === "expired" ? "La sesión de pago venció. Contacta al equipo para reabrir la reserva." : null}
          {checkoutState?.status === "failed" ? "El intento no se completó. Contacta al equipo para continuar." : null}
          {checkoutState?.status === "paid" && checkoutState.balanceQuote && (
            <div className="mt-3">
              <p>Saldo pendiente: US$ {checkoutState.balanceQuote.amountUsd} · {formatPenCents(checkoutState.balanceQuote.amountPenCents)}.</p>
              <Button className="mt-2" type="button" disabled={busy} onClick={checkoutBalance}>
                {busy ? "Conectando con Stripe…" : "Pagar saldo"}
              </Button>
            </div>
          )}
          {!checkoutState ? "Consultando el estado persistido de la reserva…" : null}
          {cancelled && checkoutState?.status === "created" && checkoutState.checkoutUrl && (
            <p className="mt-3"><a className="font-semibold underline" href={checkoutState.checkoutUrl}>Volver al checkout alojado por Stripe</a></p>
          )}
        </div>
      )}
      {!offer && !returned && !cancelled && <p role="alert">No hay una oferta activa para este viaje.</p>}
      {!returned && !cancelled && offer && !prepared && (
        <div className="flex flex-col gap-4 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Elige cómo pagar</h2>
          <label className="flex items-start gap-3 rounded-lg border p-4">
            <input type="radio" name="payment-choice" checked={choice.kind === "full"} onChange={() => setChoice({ kind: "full" })} />
            <span><strong>Pago completo</strong><br />{offer.finalPrice} · {offer.finalPricePen ?? "PEN pendiente de cotización"}</span>
          </label>
          {offer.deposits.map((deposit, index) => (
            <label key={index} className="flex items-start gap-3 rounded-lg border p-4">
              <input type="radio" name="payment-choice" checked={choice.kind === "deposit" && choice.index === index}
                onChange={() => setChoice({ kind: "deposit", index })} />
              <span><strong>Pago inicial {deposit.deposit}</strong><br />Saldo: {deposit.balance} · {deposit.balancePen ?? "PEN pendiente de cotización"}</span>
            </label>
          ))}
          {isLoaded && !isSignedIn ? <Link className="underline" href={accountUrl}>Inicia sesión o crea tu cuenta para continuar</Link>
            : isLoaded && !emailVerified ? <p>Verifica tu correo desde <Link className="underline" href={accountUrl}>tu cuenta</Link> para continuar.</p>
              : <Button type="button" disabled={busy || !isLoaded} onClick={prepare}>{busy ? "Preparando…" : "Preparar reserva"}</Button>}
        </div>
      )}
      {!returned && !cancelled && prepared && (
        <div className="flex flex-col gap-4 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Revisa la reserva y el contrato</h2>
          {prepared.resumed && <p role="status">Retomamos tu reserva pendiente para este viaje, con la forma de pago que elegiste al crearla.</p>}
          <p>Total: US$ {prepared.quote.totalUsd} · Pago inicial: US$ {prepared.quote.principalUsd} · Saldo: US$ {prepared.quote.balanceUsd}</p>
          <p>Conversión confirmada: {prepared.quote.rateUsdPen} PEN/USD. Cobro de hoy: {formatPenCents(prepared.checkoutQuotes.initial.amountPenCents)}.</p>
          {prepared.contract.testDocument && <p role="status" className="rounded-md border border-amber-500 p-3 text-sm">Documento de prueba sandbox. No tiene aprobación legal ni comercial y no puede usarse en producción.</p>}
          <details className="max-h-72 overflow-auto rounded-lg border p-4">
            <summary className="cursor-pointer font-semibold">{prepared.contract.title} · {prepared.contract.versionKey}</summary>
            <pre className="mt-4 whitespace-pre-wrap text-sm">{prepared.documentSnapshot}</pre>
          </details>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            <span>Leí y acepto el documento completo de la reserva y el contrato indicado.</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={!accepted || busy} onClick={checkout}>{busy ? "Conectando con Stripe…" : "Continuar a pagar"}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setPrepared(null); setAccepted(false); }}>Cambiar selección</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-destructive p-4 text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">Demo Stripe en sandbox. Ningún pago se considera confirmado desde esta página.</p>
    </section>
  );
}
