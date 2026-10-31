"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  simulated?: boolean;
};
type CheckoutState = {
  status: string; amountUsd: number; amountPenCents: number; checkoutUrl: string | null;
  balanceQuote: { amountUsd: number; amountPenCents: number; quoteHash: string } | null;
  simulated?: boolean;
};
// Every error response of the checkout API is `{ code, requestId }`.
type ErrorBody = { code?: unknown; requestId?: unknown };
type Choice = { kind: "full" } | { kind: "deposit"; index: number };
// What the runner can do next. `retry` repeats the failed request (with a new request id),
// `restart` goes back to choosing how to pay (prepare resumes an active reservation).
type Action =
  | { kind: "retry" | "restart" | "reload" | "refresh"; label: string }
  | { kind: "link"; label: string; href: string };
type Operation = "prepare" | "checkout" | "balance" | "state";
type CheckoutError = { message: string; requestId: string | null; action: Action | null; operation: Operation };

function isPrepared(value: unknown): value is Prepared {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<Prepared>;
  return typeof result.bookingId === "string" && typeof result.documentHash === "string"
    && typeof result.documentSnapshot === "string" && Boolean(result.checkoutQuotes?.initial?.quoteHash)
    && Boolean(result.contract?.title);
}

const MY_BOOKINGS = "/mis-carreras";
const ACCOUNT = "/cuenta";
const RETRY: Action = { kind: "retry", label: "Reintentar" };
const RESTART: Action = { kind: "restart", label: "Iniciar de nuevo" };
const RELOAD: Action = { kind: "reload", label: "Actualizar la página" };
const SEE_BOOKING: Action = { kind: "link", label: "Ver mi reserva", href: MY_BOOKINGS };
const SIGN_IN: Action = { kind: "link", label: "Ir a mi cuenta", href: ACCOUNT };

const errors: Record<string, { message: string; action: Action }> = {
  registration_required: { message: "Regístrate primero con el mismo correo de tu cuenta para asociar tu reserva.", action: RETRY },
  offer_unavailable: { message: "La oferta ya no está disponible. Actualiza la página para ver la oferta vigente.", action: RELOAD },
  rate_unavailable: { message: "No hay un tipo de cambio disponible en este momento. Inténtalo de nuevo en unos minutos.", action: RETRY },
  contract_unavailable: { message: "El contrato de esta oferta no está disponible en este momento. Inténtalo de nuevo más tarde.", action: RETRY },
  sold_out: { message: "La oferta alcanzó su cupo. Actualiza la página para ver si hay otra oferta vigente.", action: RELOAD },
  request_conflict: { message: "Recibimos otra solicitud de reserva al mismo tiempo. Vuelve a intentarlo.", action: RETRY },
  booking_exists: { message: "Ya existe una reserva para este viaje con tu correo. Revísala en Mis carreras.", action: SEE_BOOKING },
  invalid_payment_choice: { message: "La forma de pago elegida ya no está disponible. Elige otra opción.", action: { kind: "restart", label: "Elegir otra forma de pago" } },
  document_changed: { message: "El contrato cambió. Vuelve a revisar el documento.", action: { kind: "restart", label: "Revisar el contrato vigente" } },
  reservation_unavailable: { message: "La reserva ya no está disponible. Inicia el proceso otra vez.", action: RESTART },
  acceptance_conflict: { message: "No se pudo registrar la aceptación del contrato. Vuelve a intentarlo.", action: RETRY },
  contract_not_accepted: { message: "Falta registrar tu aceptación del contrato. Vuelve a intentarlo.", action: RETRY },
  reservation_expired: { message: "La reserva venció antes del pago. Inicia el proceso otra vez.", action: RESTART },
  attempt_expired: { message: "La sesión de pago anterior venció. Puedes abrir una nueva.", action: { kind: "retry", label: "Iniciar el pago de nuevo" } },
  quote_changed: { message: "El importe o el tipo de cambio cambió. Prepara la reserva otra vez para ver el importe vigente.", action: RESTART },
  attempt_conflict: { message: "Hay otro intento de pago en curso para esta reserva. Espera un momento y vuelve a intentarlo.", action: RETRY },
  payment_processing: { message: "Stripe está procesando un pago de esta reserva. Espera su confirmación antes de intentar otro pago.", action: SEE_BOOKING },
  balance_not_due: { message: "Esta reserva no tiene un saldo pendiente de pago.", action: SEE_BOOKING },
  stripe_unavailable: { message: "No pudimos conectar con Stripe. Vuelve a intentarlo en unos minutos.", action: RETRY },
  not_found: { message: "No encontramos esta reserva para tu cuenta o el pago en línea no está disponible.", action: SEE_BOOKING },
  unauthorized: { message: "Tu sesión terminó. Inicia sesión con la cuenta de la reserva para continuar.", action: SIGN_IN },
  forbidden: { message: "Tu cuenta no puede continuar con el pago. Verifica tu correo desde tu cuenta.", action: SIGN_IN },
  invalid_origin: { message: "No pudimos validar la solicitud. Actualiza la página e inténtalo de nuevo.", action: RELOAD },
  invalid_request: { message: "No pudimos validar la solicitud. Actualiza la página e inténtalo de nuevo.", action: RELOAD },
  internal: { message: "Ocurrió un error inesperado. Vuelve a intentarlo.", action: RETRY },
};

async function readError(response: Response): Promise<ErrorBody> {
  try { return await response.json() as ErrorBody; } catch { return {}; }
}
// The reference lets the team find the server log line of this exact failure.
function describeError(body: ErrorBody, fallback: string, operation: Operation): CheckoutError {
  const known = typeof body.code === "string" ? errors[body.code] : undefined;
  return {
    message: known?.message ?? fallback,
    requestId: typeof body.requestId === "string" ? body.requestId : null,
    action: known?.action ?? RETRY,
    operation,
  };
}

// Server-side state of the attempt after returning from Stripe, with what the runner can do next.
function returnNotice(state: CheckoutState, cancelled: boolean): { message: string; actions: Action[] } {
  switch (state.status) {
    case "paid":
      return { message: "Pago confirmado. Tu reserva quedó registrada.", actions: [SEE_BOOKING] };
    case "needs_review":
      return {
        message: "Pago en revisión: Stripe informó un pago que el equipo debe conciliar. No inicies otro pago; te avisaremos cuando quede revisado.",
        actions: [SEE_BOOKING],
      };
    case "created":
      return cancelled
        ? { message: "No completaste el pago en Stripe. Tu reserva sigue pendiente.", actions: state.checkoutUrl ? [] : [RESTART] }
        : { message: "Procesando: el pago todavía no está confirmado. Puede tardar unos minutos.", actions: [{ kind: "refresh", label: "Consultar de nuevo" }] };
    case "pending":
      return { message: "Tu reserva está pendiente de pago.", actions: [{ kind: "restart", label: "Retomar la reserva" }] };
    case "expired":
      return { message: "La sesión de pago venció sin completarse. Puedes iniciar el pago de nuevo.", actions: [RESTART, SEE_BOOKING] };
    case "failed":
      return { message: "El pago no se completó. Puedes intentarlo de nuevo.", actions: [RESTART, SEE_BOOKING] };
    default:
      return { message: "Procesando: esperamos la confirmación de Stripe. Puede tardar unos minutos.", actions: [{ kind: "refresh", label: "Consultar de nuevo" }] };
  }
}

export function RunnerCheckout({
  tripId, tripTitle, campaignCode, offer, returned, cancelled, bookingId, attemptId,
}: {
  tripId: string; tripTitle: string; campaignCode: string | null; offer: OfferView | null;
  returned: boolean; cancelled: boolean; bookingId: string | null; attemptId: string | null;
  // The configured mode (test or demo) creates simulated bookings: shown from the first step.
  simulated: boolean;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>({ kind: "full" });
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CheckoutError | null>(null);
  const [checkoutState, setCheckoutState] = useState<CheckoutState | null>(null);
  // Bumped by "Consultar de nuevo" and by retrying a failed state lookup.
  const [stateRequest, setStateRequest] = useState(0);
  const returnMode = returned || cancelled;

  useEffect(() => {
    if (!bookingId || !attemptId) return;
    const controller = new AbortController();
    const fallback = "No pudimos consultar el estado de la reserva. Inicia sesión con la cuenta de la reserva.";
    void fetch(`/api/bookings/${bookingId}/checkout/${attemptId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) { setError(describeError(await readError(response), fallback, "state")); return; }
        setCheckoutState(await response.json() as CheckoutState);
      })
      .catch(() => { if (!controller.signal.aborted) setError(describeError({}, fallback, "state")); });
    return () => controller.abort();
  }, [bookingId, attemptId, stateRequest]);

  const emailVerified = user?.primaryEmailAddress?.verification?.status === "verified";

  async function prepare() {
    const fallback = "No se pudo preparar la reserva.";
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/bookings/checkout/prepare", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId, campaignCode: campaignCode ?? undefined, paymentChoice: choice, requestId: crypto.randomUUID() }),
      });
      if (!response.ok) { setError(describeError(await readError(response), fallback, "prepare")); return; }
      const result: unknown = await response.json();
      if (!isPrepared(result)) { setError(describeError({}, fallback, "prepare")); return; }
      setPrepared(result); setAccepted(false);
    } catch { setError(describeError({}, fallback, "prepare")); }
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
      if (!acceptedResponse.ok) {
        setError(describeError(await readError(acceptedResponse), "No se pudo registrar la aceptación del contrato.", "checkout"));
        setBusy(false); return;
      }
      await openStripe(prepared.bookingId, "initial", prepared.checkoutQuotes.initial.quoteHash, "No se pudo iniciar el pago.", "checkout");
    } catch { setError(describeError({}, "No se pudo iniciar el pago.", "checkout")); setBusy(false); }
  }

  async function checkoutBalance() {
    if (!bookingId || !checkoutState?.balanceQuote) return;
    setBusy(true); setError(null);
    try {
      await openStripe(bookingId, "balance", checkoutState.balanceQuote.quoteHash, "No se pudo iniciar el pago del saldo.", "balance");
    } catch { setError(describeError({}, "No se pudo iniciar el pago del saldo.", "balance")); setBusy(false); }
  }

  // Each click sends a new request id, so a retired attempt never blocks a new one.
  async function openStripe(id: string, kind: "initial" | "balance", quoteHash: string, fallback: string, operation: Operation) {
    const response = await fetch(`/api/bookings/${id}/checkout`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: crypto.randomUUID(), kind, quoteHash }),
    });
    if (!response.ok) { setError(describeError(await readError(response), fallback, operation)); setBusy(false); return; }
    const result = await response.json() as { checkoutUrl?: unknown };
    if (typeof result.checkoutUrl !== "string") { setError(describeError({}, fallback, operation)); setBusy(false); return; }
    window.location.assign(result.checkoutUrl);
  }

  function refreshState() {
    setError(null); setCheckoutState(null); setStateRequest((count) => count + 1);
  }

  // Back to choosing how to pay; after Stripe, the same page without the return parameters.
  function restart() {
    setError(null);
    if (returnMode) {
      setCheckoutState(null);
      router.push(`${window.location.pathname}${campaignCode ? `?c=${encodeURIComponent(campaignCode)}` : ""}`);
      return;
    }
    setPrepared(null); setAccepted(false);
  }

  function run(action: Action, operation?: Operation) {
    if (action.kind === "restart") restart();
    else if (action.kind === "reload") window.location.reload();
    else if (action.kind === "refresh") refreshState();
    else if (action.kind === "retry") {
      if (operation === "prepare") void prepare();
      else if (operation === "checkout") void checkout();
      else if (operation === "balance") void checkoutBalance();
      else refreshState();
    }
  }

  function actionControl(action: Action, operation?: Operation) {
    if (action.kind === "link") {
      return <Link key={action.label} className="font-semibold underline" href={action.href}>{action.label}</Link>;
    }
    return (
      <Button key={action.label} type="button" variant="outline" disabled={busy} onClick={() => run(action, operation)}>
        {action.label}
      </Button>
    );
  }

  const notice = checkoutState ? returnNotice(checkoutState, cancelled) : null;

  return (
    // Desktop: the summary stays on the left and the steps take the wider right column.
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-[5%] py-10 text-night lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-x-14 lg:py-16 lg:[&>*:not(:first-child)]:col-start-2">
      <div className="lg:sticky lg:top-32 lg:row-span-6">
        <p className="text-sm font-semibold tracking-wide text-muted-foreground">CARRERAS VIAJERAS · CHECKOUT</p>
        <h1 className="mt-2 text-3xl font-bold lg:text-4xl">{tripTitle}</h1>
        <p className="mt-3 text-lg">Asegura tu lugar en 3 pasos.</p>
        <CheckoutSteps current={returnMode ? 3 : prepared ? 2 : 1} />
        <p className="mt-6 text-sm text-muted-foreground">Solo aceptamos tarjetas. El pago se completa en Stripe, con conexión segura.</p>
      </div>
      {returnMode && (
        <div role="status" className="flex flex-col gap-3 rounded-lg bg-sky p-4">
          <p>{notice ? notice.message : error?.operation === "state" ? "No pudimos consultar el estado de la reserva." : "Consultando el estado de la reserva…"}</p>
          {notice && notice.actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">{notice.actions.map((action) => actionControl(action))}</div>
          )}
          {cancelled && checkoutState?.status === "created" && checkoutState.checkoutUrl && (
            <p><a className="font-semibold underline" href={checkoutState.checkoutUrl}>Volver al pago en Stripe</a></p>
          )}
          {checkoutState?.status === "paid" && checkoutState.balanceQuote && (
            <div>
              <p>Saldo pendiente: US$ {checkoutState.balanceQuote.amountUsd} · {formatPenCents(checkoutState.balanceQuote.amountPenCents)}.</p>
              <Button className="mt-2" type="button" disabled={busy} onClick={checkoutBalance}>
                {busy ? "Conectando con Stripe…" : "Pagar saldo"}
              </Button>
            </div>
          )}
        </div>
      )}
      {!offer && !returnMode && <p role="alert">No hay una oferta activa para este viaje.</p>}
      {!returnMode && offer && !prepared && (
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
          {isLoaded && !isSignedIn ? <Link className="underline" href={ACCOUNT}>Inicia sesión o crea tu cuenta para continuar</Link>
            : isLoaded && !emailVerified ? <p>Verifica tu correo desde <Link className="underline" href={ACCOUNT}>tu cuenta</Link> para continuar.</p>
              : <Button type="button" disabled={busy || !isLoaded} onClick={prepare}>{busy ? "Preparando…" : "Preparar reserva"}</Button>}
        </div>
      )}
      {!returnMode && prepared && (
        <div className="flex flex-col gap-4 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Revisa la reserva y el contrato</h2>
          {prepared.resumed && <p role="status">Retomamos tu reserva pendiente para este viaje, con la forma de pago que elegiste al crearla.</p>}
          <p>Total: US$ {prepared.quote.totalUsd} · Pago inicial: US$ {prepared.quote.principalUsd} · Saldo: US$ {prepared.quote.balanceUsd}</p>
          <p>Conversión confirmada: {prepared.quote.rateUsdPen} PEN/USD. Cobro de hoy: {formatPenCents(prepared.checkoutQuotes.initial.amountPenCents)}.</p>
          {prepared.contract.testDocument && <p role="status" className="rounded-md border border-night/20 bg-sky p-3 text-sm">Documento de prueba: no tiene aprobación legal ni comercial.</p>}
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
      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive p-4">
          <p className="text-destructive">{error.message}</p>
          {error.requestId && <p className="text-sm text-muted-foreground">Referencia: {error.requestId}</p>}
          {error.action && <div className="flex flex-wrap items-center gap-3">{actionControl(error.action, error.operation)}</div>}
        </div>
      )}
      <p className="text-sm text-muted-foreground">El pago se confirma cuando Stripe lo informa a nuestro servidor, no desde esta página.</p>
    </section>
  );
}

const STEPS = [
  { title: "Elige cómo pagar", text: "Pago completo o un pago inicial para reservar hoy." },
  { title: "Revisa y acepta", text: "Confirma el importe en soles y acepta el contrato de tu reserva." },
  { title: "Paga y listo", text: "Pagas con tarjeta en Stripe y tu reserva queda confirmada en Mis carreras." },
];

/** The three steps of the checkout; `current` highlights where the runner is. */
function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="mt-6 grid gap-4">
      {STEPS.map((step, index) => {
        const number = index + 1;
        const state = number < current ? "done" : number === current ? "current" : "next";
        return (
          <li key={step.title} aria-current={state === "current" ? "step" : undefined} className="flex gap-3">
            <span
              aria-hidden
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold",
                state === "current" && "border-primary bg-primary text-primary-foreground",
                state === "done" && "border-highlight bg-highlight text-night",
                state === "next" && "border-night/25 text-night/60",
              )}
            >
              {state === "done" ? "✓" : number}
            </span>
            <span className={cn(state === "next" && "text-night/70")}>
              <span className="block font-semibold">{step.title}</span>
              <span className="block text-sm">{step.text}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
