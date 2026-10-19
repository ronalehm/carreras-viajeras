import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  Heart,
  ShieldCheck,
  Ticket,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";

const KEY_POINTS = [
  { glyph: "↗", title: "Un viaje organizado", text: "Vuelos, hotel e inscripción en un paquete." },
  { glyph: "◎", title: "Una meta compartida", text: "Viaja con runners de Perú." },
  { glyph: "✓", title: "Respaldo de MAZ", text: "El equipo detrás de Carreras Viajeras." },
];

const CARDS: { icon: LucideIcon; title: string; summary: string; detail: string }[] = [
  {
    icon: Ticket,
    title: "Inscripción en tu paquete",
    summary: "Tu objetivo: la maratón de Santiago 42K.",
    detail:
      "La propuesta incluye la inscripción a los 42K. La asignación efectiva se confirmará antes de contratar; no se anuncia aquí un dorsal garantizado ni una alianza oficial con el organizador.",
  },
  {
    icon: Building2,
    title: "Hotel pensado para la carrera",
    summary: "3 noches, categoría 4 estrellas y cercanía a la partida.",
    detail:
      "El paquete ofrece un hotel de 4 estrellas cercano al punto de partida. Nombre, ubicación exacta, distancia y ocupación de habitación están pendientes de confirmar.",
  },
  {
    icon: Users,
    title: "Viaja con runners de Perú",
    summary: "Comparte la previa y la emoción de correr fuera.",
    detail:
      "La propuesta contempla traslado y acompañamiento grupal a la Expo y al punto de partida, en los horarios que se definan. La comunidad digital todavía está en demostración.",
  },
  {
    icon: Utensils,
    title: "Desayuno y logística",
    summary: "Lo esencial del viaje, en un solo paquete.",
    detail:
      "Se incluyen desayuno, traslados aeropuerto–hotel–aeropuerto y los traslados grupales anunciados. El horario del desayuno y de cada servicio está por confirmar. No se ofrecen nutrición personalizada, cena de carbohidratos ni asesoría médica preventiva.",
  },
  {
    icon: Heart,
    title: "Acompañantes bienvenidos",
    summary: "Tu viaje también puede compartirse fuera de la pista.",
    detail:
      "Tarifa anunciada de acompañante: US$1,300. Inclusiones, ocupación de habitación y condiciones requieren confirmación por separado. Los tours y actividades adicionales no están incluidos.",
  },
  {
    icon: ShieldCheck,
    title: "Respaldo de MAZ Producciones",
    summary: "Carreras Viajeras es una unidad de MAZ.",
    detail:
      "MAZ PRODUCCIONES Y MAZ S.A.C., RUC 20601664934. Según los datos proporcionados por el equipo, su trayectoria de 2025 comprende +15 maratones internacionales y +500 runners. Consulta la información del operador y las condiciones del viaje.",
  },
];

/** Hides the native marker and draws "+" / "−" on the right. */
const SUMMARY_CLASS =
  "relative cursor-pointer list-none pr-8 after:absolute after:top-1/2 after:right-0 after:-translate-y-1/2 after:text-xl after:font-normal after:content-['+'] [&::-webkit-details-marker]:hidden";

export function WhyUsSection() {
  return (
    <section
      id="por-que-viajar"
      aria-labelledby="why-title"
      className="border-t border-primary/15 px-[6%] py-8 text-primary sm:px-[8%] sm:py-10"
    >
      <div className="grid items-center gap-6 md:grid-cols-[1fr_1.5fr] md:gap-[7%]">
        <h2
          id="why-title"
          className="font-heading text-4xl leading-none font-bold tracking-tight sm:text-5xl"
        >
          ¿Por qué viajar
          <br />
          con nosotros?
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3 sm:gap-6">
          {KEY_POINTS.map(({ glyph, title, text }, index) => {
            const tone = index % 2 === 0 ? "text-highlight" : "text-primary";
            return (
              <li key={title} className="flex items-start gap-3.5 sm:block">
                <span
                  aria-hidden
                  className={`block w-6 shrink-0 text-xl sm:mb-3 sm:text-2xl ${tone}`}
                >
                  {glyph}
                </span>
                <div>
                  <strong className={`mb-1 block text-sm ${tone}`}>{title}</strong>
                  <p className="text-xs leading-relaxed">{text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <details className="group/more mt-6 border-t border-primary/15">
        <summary
          className={`${SUMMARY_CLASS} pt-4 text-xs font-semibold group-open/more:after:content-['−']`}
        >
          <span className="group-open/more:hidden">Ver más</span>
          <span className="hidden group-open/more:inline">Ver menos</span>
        </summary>
        <div className="pt-6">
          <div className="grid grid-cols-2 gap-x-4.5 gap-y-6 md:grid-cols-3 md:gap-x-9">
            {CARDS.map(({ icon: Icon, title, summary, detail }, index) => {
              const isBlue = index % 2 === 0;
              const tone = isBlue ? "text-primary" : "text-highlight";
              const border = isBlue ? "border-primary/15" : "border-highlight/40";
              return (
                <article key={title} className={`border-t pt-4 sm:pt-5 ${border}`}>
                  <Icon
                    aria-hidden
                    className={`mb-3.5 size-6 stroke-[1.5] sm:mb-4 sm:size-7 ${tone}`}
                  />
                  <h3 className={`mb-2 text-sm font-bold sm:text-base ${tone}`}>{title}</h3>
                  <p className="mb-2 max-w-72 text-xs">{summary}</p>
                  <details className="group/card pt-2">
                    <summary
                      className={`${SUMMARY_CLASS} max-w-72 text-xs font-medium group-open/card:after:content-['−']`}
                    >
                      Ver detalle
                    </summary>
                    <p className="mt-3 text-xs leading-loose">{detail}</p>
                  </details>
                </article>
              );
            })}
          </div>
          <div className="mt-6 border-t border-primary/15 pt-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
            <Link
              href="/contacto"
              className="inline-flex items-center gap-1 text-xs font-bold underline underline-offset-[5px]"
            >
              Hablemos de tu próxima carrera <ArrowUpRight aria-hidden className="size-4" />
            </Link>
            <span className="mt-3 block text-xs sm:mt-0 sm:max-w-88 sm:text-right">
              Propuesta Santiago 2027 · Servicios sujetos a confirmación operativa.
            </span>
          </div>
        </div>
      </details>
    </section>
  );
}
