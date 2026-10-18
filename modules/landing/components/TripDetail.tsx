import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Trip } from "../utils/trips";
import { TripFacts } from "./TripFacts";

const eyebrow = "text-xs font-bold tracking-[0.15em]";

export function TripDetail({ trip }: { trip: Trip }) {
  const { prices } = trip;
  const payments = [
    { label: "AL CONTADO", value: prices.cash },
    { label: "EN CUOTAS · PRECIO TOTAL", value: prices.installmentsTotal },
  ];

  return (
    <article className="text-primary">
      <header className="relative isolate flex min-h-[50svh] items-end overflow-hidden bg-primary text-primary-foreground">
        <Image
          src={trip.image}
          alt={trip.imageAlt}
          fill
          preload
          sizes="100vw"
          className="-z-20 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-primary/5 from-30% to-primary/85" />
        <div className="w-full px-[6%] pt-20 pb-10 sm:px-[8%] sm:pb-14">
          <p className={cn(eyebrow, "mb-4 whitespace-pre-line")}>{trip.coverLabel}</p>
          <h1 className="max-w-3xl font-heading text-5xl leading-none font-bold tracking-tight sm:text-6xl lg:text-7xl">
            {trip.name}
          </h1>
        </div>
      </header>

      <TripFacts trip={trip} />

      <div className="grid gap-10 px-[6%] py-10 sm:px-[8%] sm:py-14 md:grid-cols-[0.8fr_1.4fr] md:gap-[7%]">
        <div>
          <ul aria-label="Beneficios principales" className="mb-10 grid gap-2.5 text-sm">
            {trip.highlights.map((highlight) => (
              <li key={highlight}>
                <span aria-hidden>✓ </span>
                {highlight}
              </li>
            ))}
          </ul>

          <section aria-labelledby="trip-prices-title">
            <h2 id="trip-prices-title" className={cn(eyebrow, "mb-2")}>
              PRECIOS Y CONDICIONES
            </h2>
            <dl>
              {payments.map(({ label, value }) => (
                <div key={label} className="border-b border-primary/25 py-4">
                  <dt className={eyebrow}>{label}</dt>
                  <dd className="text-4xl leading-tight font-bold tracking-tight">{value}</dd>
                </div>
              ))}
              <div className="mt-3.5 border-b border-l-4 border-b-primary/25 border-l-highlight py-4 pl-4">
                <dt className={eyebrow}>RESERVA CON</dt>
                <dd className="text-3xl leading-tight font-bold">{prices.reservation}</dd>
              </div>
              <div className="border-b border-primary/25 py-4">
                <dt className={eyebrow}>ACOMPAÑANTE</dt>
                <dd>
                  <strong className="block text-3xl leading-tight font-bold">
                    {prices.companion}
                  </strong>
                  <small className="block text-xs">{prices.companionNote}</small>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed">{prices.paymentNote}</p>
          </section>
        </div>

        <div className="min-w-0">
          <section aria-labelledby="trip-included-title">
            <h2
              id="trip-included-title"
              className={cn(eyebrow, "border-b-3 border-highlight pb-4")}
            >
              <span aria-hidden>✓ </span>SÍ ESTÁ INCLUIDO
            </h2>
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {trip.included.map(({ title, text }) => (
                <li
                  key={title}
                  className="flex items-start gap-2.5 border-b border-primary/20 py-4"
                >
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-[0_2px_0_var(--highlight)]"
                  >
                    ✓
                  </span>
                  <div>
                    <h3 className="mb-1 text-sm font-bold">{title}</h3>
                    <p className="text-xs leading-relaxed">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="trip-excluded-title"
            className="mt-6 rounded-sm border border-l-4 border-primary/25 border-l-primary p-4.5"
          >
            <h2 id="trip-excluded-title" className="mb-2.5 text-base font-bold">
              No está incluido
            </h2>
            {trip.excluded.map((item) => (
              <p key={item} className="my-1.5 text-xs">
                <span aria-hidden>× </span>
                {item}
              </p>
            ))}
          </section>

          <details open className="group mt-6 border-b border-primary/20 pb-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
              Detalles que falta confirmar
              <span aria-hidden className="text-lg group-open:hidden">
                +
              </span>
              <span aria-hidden className="hidden text-lg group-open:inline">
                −
              </span>
            </summary>
            {trip.pendingDetails.map((paragraph) => (
              <p key={paragraph} className="mb-3 text-xs leading-relaxed">
                {paragraph}
              </p>
            ))}
          </details>

          <Link
            href={`/contacto?destino=${trip.destinationId}`}
            className={cn(
              buttonVariants(),
              "mt-8 h-auto w-full gap-1.5 rounded-sm px-6 py-4 text-sm font-bold shadow-[inset_0_-4px_0_var(--highlight)] sm:w-auto",
            )}
          >
            Quiero correr Santiago <ArrowUpRight aria-hidden />
          </Link>
          <p className="mt-4 max-w-88 text-xs leading-relaxed">{trip.disclaimer}</p>
        </div>
      </div>
    </article>
  );
}
