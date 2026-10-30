import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRIPS } from "../utils/trips";

const santiago = TRIPS[0];

const DESTINATIONS = [
  {
    href: `/viajes/${santiago.slug}`,
    image: "/images/destino-santiago.webp",
    alt: "Salida de la Maratón de Santiago con los corredores en la línea de partida",
    flag: "🇨🇱",
    status: "Preventa abierta",
    statusTone: "bg-highlight text-night",
    date: santiago.raceDate,
    tagline: "Destino principal",
    name: "Santiago",
    location: "Santiago, Chile",
    tags: ["42K", "3 noches"],
    note: `Preventa / ${santiago.prices.cash} al contado · ${santiago.prices.installmentsTotal} en cuotas`,
    action: "Quiero información",
    active: true,
  },
  {
    href: "/viajes/maraton-rio-2027#destino-no-encontrado",
    image: "/images/destino-rio.webp",
    alt: "Vista aérea de Río de Janeiro con el Cristo Redentor",
    flag: "🇧🇷",
    status: "En exploración",
    statusTone: "bg-night text-primary-foreground",
    date: "Fecha por confirmar",
    tagline: "Sin cupos asignados",
    name: "Río",
    location: "Río de Janeiro, Brasil",
    tags: [],
    note: "Sin carrera, fecha ni precio confirmados",
    action: "Ver el viaje",
    active: false,
  },
  {
    href: "/viajes/maraton-roma-2027#destino-no-encontrado",
    image: "/images/destino-roma.webp",
    alt: "El Coliseo de Roma al atardecer",
    flag: "🇮🇹",
    status: "En exploración",
    statusTone: "bg-night text-primary-foreground",
    date: "Fecha por confirmar",
    tagline: "Sin cupos asignados",
    name: "Roma",
    location: "Roma, Italia",
    tags: [],
    note: "Sin carrera, fecha ni precio confirmados",
    action: "Ver el viaje",
    active: false,
  },
];

export function DestinationsSection() {
  return (
    <section
      id="destinos"
      aria-labelledby="destinations-title"
      className="bg-background px-[6%] py-18 text-primary sm:px-[8%] lg:py-28"
    >
      <div className="mb-10 gap-8 sm:flex sm:items-end sm:justify-between lg:mb-14">
        <div>
          <p className="mb-4 text-sm font-semibold text-asphalt">Esto recién empieza</p>
          <h2 id="destinations-title" className="display-title text-display-section">
            Más ciudades.
            <br />
            Más razones para correr.
          </h2>
        </div>
        <p className="mt-5 text-base leading-relaxed text-asphalt sm:mt-0 sm:shrink-0 sm:text-right">
          Elige tu próximo destino.
          <br />
          Te contamos cuando haya novedades.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {DESTINATIONS.map(
          ({
            href,
            image,
            alt,
            flag,
            status,
            statusTone,
            date,
            tagline,
            name,
            location,
            tags,
            note,
            action,
            active,
          }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex flex-col overflow-hidden rounded-2xl border no-underline transition-colors",
                active
                  ? "border-highlight bg-background hover:border-primary"
                  : "border-primary/15 bg-background hover:border-primary",
              )}
            >
              <div className="relative aspect-video overflow-hidden bg-night">
                <Image
                  src={image}
                  alt={alt}
                  fill
                  sizes="(min-width: 768px) 30vw, 100vw"
                  className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
                />
                <span
                  aria-hidden
                  className="absolute top-3 left-3 z-10 rounded-full bg-background px-2 py-0.5 text-2xl"
                >
                  {flag}
                </span>
                <span
                  className={cn(
                    "absolute top-3 right-3 z-10 rounded-full px-3 py-1 text-xs font-semibold",
                    statusTone,
                  )}
                >
                  {status}
                </span>
              </div>

              <div className="flex grow flex-col p-5 lg:p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-asphalt">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays aria-hidden className="size-4" />
                    {date}
                  </span>
                  <span className="font-semibold text-primary">{tagline}</span>
                </div>

                <h3 className="mb-2 display-title text-5xl leading-none">{name}</h3>
                <p className="mb-4 inline-flex items-center gap-1.5 text-sm text-asphalt">
                  <MapPin aria-hidden className="size-4" />
                  {location}
                </p>

                {tags.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-sky px-3 py-1 text-sm font-semibold"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto space-y-3 border-t border-primary/15 pt-4">
                  <p className="text-sm leading-relaxed text-asphalt">{note}</p>
                  <span className="inline-flex items-center gap-1 text-base font-semibold underline decoration-highlight decoration-2 underline-offset-[6px]">
                    {action} <ArrowUpRight aria-hidden className="size-4" />
                  </span>
                </div>
              </div>
            </Link>
          ),
        )}
      </div>
    </section>
  );
}
