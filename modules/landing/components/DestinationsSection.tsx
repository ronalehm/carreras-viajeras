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
    statusTone: "bg-highlight text-white",
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
    href: "/contacto?destino=rio",
    image: "/images/destino-rio.webp",
    alt: "Vista aérea de Río de Janeiro con el Cristo Redentor",
    flag: "🇧🇷",
    status: "En exploración",
    statusTone: "bg-primary text-primary-foreground",
    date: "Fecha por confirmar",
    tagline: "Sin cupos asignados",
    name: "Río",
    location: "Río de Janeiro, Brasil",
    tags: [],
    note: "Sin carrera, fecha ni precio confirmados",
    action: "Avísame cuando esté disponible",
    active: false,
  },
  {
    href: "/contacto?destino=roma",
    image: "/images/destino-roma.webp",
    alt: "El Coliseo de Roma al atardecer",
    flag: "🇮🇹",
    status: "En exploración",
    statusTone: "bg-primary text-primary-foreground",
    date: "Fecha por confirmar",
    tagline: "Sin cupos asignados",
    name: "Roma",
    location: "Roma, Italia",
    tags: [],
    note: "Sin carrera, fecha ni precio confirmados",
    action: "Avísame cuando esté disponible",
    active: false,
  },
];

export function DestinationsSection() {
  return (
    <section
      id="destinos"
      aria-labelledby="destinations-title"
      className="px-[6%] py-10 text-primary sm:px-[8%] sm:py-14"
    >
      <div className="mb-6 gap-8 sm:mb-9 sm:flex sm:items-end sm:justify-between">
        <div>
          <p className="mb-6 text-xs font-bold tracking-[0.2em]">ESTO RECIÉN EMPIEZA</p>
          <h2
            id="destinations-title"
            className="font-heading text-5xl leading-none font-bold tracking-tight"
          >
            Más ciudades.
            <br />
            Más razones para correr.
          </h2>
        </div>
        <p className="mt-4 text-xs leading-relaxed sm:mt-0">
          Elige tu próximo destino.
          <br />
          Te contamos cuando haya novedades.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
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
                "group flex flex-col overflow-hidden rounded-2xl border no-underline transition-all hover:-translate-y-1 hover:shadow-xl",
                active
                  ? "border-highlight/50 bg-background shadow-sm"
                  : "border-primary/20 bg-background shadow-sm",
              )}
            >
              <div className="relative aspect-video overflow-hidden border-b border-primary/15 bg-primary/10">
                <Image
                  src={image}
                  alt={alt}
                  fill
                  sizes="(min-width: 768px) 30vw, 100vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span
                  aria-hidden
                  className="absolute top-3 left-3 z-10 rounded-xl bg-white/95 px-2 py-1 text-2xl shadow-sm backdrop-blur-md"
                >
                  {flag}
                </span>
                <span
                  className={cn(
                    "absolute top-3 right-3 z-10 rounded-full px-3 py-1 text-[11px] font-bold tracking-wider text-white uppercase shadow-sm",
                    statusTone,
                  )}
                >
                  {status}
                </span>
              </div>

              <div className="flex grow flex-col p-5 lg:p-6">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-primary/70">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays aria-hidden className="size-3.5" />
                    {date}
                  </span>
                  <span className="font-bold text-highlight">{tagline}</span>
                </div>

                <h3 className="mb-1 font-heading text-2xl leading-tight font-bold tracking-tight lg:text-3xl">
                  {name}
                </h3>
                <p className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary/70">
                  <MapPin aria-hidden className="size-3.5" />
                  {location}
                </p>

                {tags.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-lg border border-highlight/30 bg-highlight/10 px-2.5 py-0.5 text-xs font-bold text-highlight"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto space-y-3 border-t border-primary/15 pt-4">
                  <p className="text-xs leading-relaxed">{note}</p>
                  <span className="inline-flex items-center gap-1 border-b-3 border-highlight pt-1 text-xs font-bold">
                    {action} <ArrowUpRight aria-hidden className="size-3.5" />
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
