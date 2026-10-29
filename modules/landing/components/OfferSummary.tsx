import { cn } from "@/lib/utils";
import type { OfferView } from "../utils/catalogOffer";

type OfferSummaryProps = { offer: OfferView; className?: string };

// Provisional texts until gates P-L/P-T (spec trips-commercial-offers, open question 1): once
// approved, they are replaced here in build mode.
const NO_RATE_NOTICE = "El importe en soles se mostrará antes de pagar.";
function exchangeRateRule({ rate, since }: NonNullable<OfferView["exchangeRate"]>): string {
  return (
    "Los precios están en dólares (USD). Si pagas en soles, el importe se calcula con el tipo de cambio " +
    "que fija Carreras Viajeras y que esté vigente el día del pago. " +
    `Tipo de cambio de hoy: S/ ${rate} por US$ 1 (vigente desde el ${since}). ` +
    "El saldo se convierte con el tipo vigente el día en que lo pagues."
  );
}

/** "US$ 2,000" with its soles in parentheses when there is a rate. */
function Amount({ usd, pen }: { usd: string; pen: string | null }) {
  return (
    <>
      {usd}
      {pen && <span className="font-normal"> ({pen})</span>}
    </>
  );
}

/**
 * Public price block of the offer in force (presentational). No pay or booking button, no seats,
 * no internal name or campaign: the view does not carry them.
 */
export function OfferSummary({ offer, className }: OfferSummaryProps) {
  const amounts = [
    { label: "Precio total", usd: offer.totalPrice, pen: offer.totalPricePen },
    ...(offer.discount ? [{ label: "Descuento", usd: offer.discount, pen: offer.discountPen }] : []),
  ];

  return (
    <section aria-labelledby="offer-summary-title" className={cn("grid gap-6 wrap-break-word", className)}>
      <h2 id="offer-summary-title" className="display-title text-4xl sm:text-5xl">
        Precio y condiciones
      </h2>

      <dl className="grid gap-4">
        {amounts.map(({ label, usd, pen }) => (
          <div key={label}>
            <dt className="text-xs">{label}</dt>
            <dd className="mt-1 font-bold">
              <Amount usd={usd} pen={pen} />
            </dd>
          </div>
        ))}
        <div className="border-t border-primary/15 pt-4">
          <dt className="text-xs">Precio final</dt>
          <dd className="mt-1 text-3xl font-bold tracking-tight">
            {offer.finalPrice}
            {offer.finalPricePen && (
              <span className="block text-base font-semibold tracking-normal">({offer.finalPricePen})</span>
            )}
          </dd>
        </div>
      </dl>

      {offer.deposits.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold tracking-wide">Anticipos permitidos</h3>
          <ul className="mt-3 grid gap-3 text-sm">
            {offer.deposits.map(({ deposit, depositPen, balance, balancePen }) => (
              <li key={deposit} className="rounded-lg bg-sky px-4 py-3 text-night">
                <p>
                  Anticipo:{" "}
                  <strong>
                    <Amount usd={deposit} pen={depositPen} />
                  </strong>
                </p>
                <p className="mt-1">
                  Saldo:{" "}
                  <strong>
                    <Amount usd={balance} pen={balancePen} />
                  </strong>
                  {offer.balanceDueOn && <> hasta el {offer.balanceDueOn}</>}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">El anticipo se descuenta del precio final.</p>
        </div>
      ) : (
        <p className="text-sm">Pago único del precio final.</p>
      )}

      {offer.bonus && (
        <p className="text-sm">
          <strong>Beneficio incluido: {offer.bonus}.</strong> No es un descuento ni se canjea por dinero.
        </p>
      )}

      <p className="text-sm font-semibold">{offer.validity}</p>

      <details open className="border-t border-primary/15 pt-4">
        <summary className="cursor-pointer text-sm font-bold tracking-wide">
          Condiciones de pago y cancelación
        </summary>
        <div className="mt-3 grid gap-3 text-sm leading-relaxed">
          {offer.conditions.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          <p className="text-xs">Versión de las condiciones: {offer.termsVersion}</p>
        </div>
      </details>

      <p className="text-xs leading-relaxed">
        {offer.exchangeRate ? exchangeRateRule(offer.exchangeRate) : NO_RATE_NOTICE}
      </p>
    </section>
  );
}
