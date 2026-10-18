import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Tip, TipList } from "./TipList";

const REFERENTS = [
  {
    name: "Daniela\nZarfati",
    image: "/images/daniela-zafarti.jpg",
    alt: "Daniela Zarfati",
    disclaimer: "FOTO REAL DE DANIELA",
  },
  {
    name: "Karla\nMedina",
    image: "/images/carla-medina.jpg",
    alt: "Karla Medina",
    disclaimer: "FOTO REAL DE KARLA",
  },
];

const TIPS: Tip[] = [
  {
    category: "empezar",
    image: "/images/running-road.jpg",
    eyebrow: "TU PRIMERA CARRERA · 45 S",
    title: "Antes del 42K,\nencuentra tu punto de partida.",
    summary: "Tu primera carrera y tu primera maratón pueden ser etapas distintas.",
    body: "Si estás empezando a correr, construye el hábito de forma gradual y elige una distancia acorde a tu experiencia. Los programas de iniciación a 5K no sustituyen la preparación específica de una maratón. Define el objetivo desde tu situación actual, no desde la presión de una fecha.",
    source: {
      label: "NHS · Iniciación al running",
      href: "https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/",
    },
  },
  {
    category: "empezar",
    image: "/images/running-team.jpg",
    eyebrow: "TU MOTIVACIÓN · 30 S",
    title: "¿Por qué correr\nuna maratón?",
    summary: "Un reto personal. Una ciudad nueva. Una historia compartida.",
    body: "Tu razón puede ser disfrutar del proceso, explorar una ciudad o compartir una meta con amigos. La actividad física regular puede favorecer el ánimo y el bienestar; completar 42K no es necesario para obtener esos beneficios ni garantiza una transformación personal. Elige un desafío que tenga sentido para ti.",
    source: {
      label: "NHS · Actividad y bienestar",
      href: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/be-active-for-your-mental-health/",
    },
  },
  {
    category: "preparar",
    image: "/images/running-training.jpg",
    eyebrow: "PREPARACIÓN · 45 S",
    title: "Un plan que\nse adapte a ti.",
    summary: "La constancia también incluye recuperar.",
    body: "La preparación de maratón necesita progresión y estructura. Elige un plan que corresponda a tu base y disponibilidad, con orientación profesional para adaptarlo. No copies el volumen o los ritmos de otra persona. La B.A.A. publica planes por niveles: son referencias generales, no una prescripción individual ni un servicio incluido en el paquete.",
    source: {
      label: "B.A.A. · Preparación de maratón",
      href: "https://www.baa.org/races/boston-marathon/info-for-athletes/boston-marathon-training/",
    },
  },
  {
    category: "viajar",
    image: "/images/santiago.jpg",
    eyebrow: "TU PRIMERA INTERNACIONAL · 45 S",
    title: "La carrera empieza\nantes del avión.",
    summary: "Documentos, kit, horarios y regreso: prepara también el viaje.",
    body: "Revisa requisitos de entrada y de la aerolínea en sus canales oficiales; las bases de la edición, cómo retirar el kit y el traslado a la salida. En Santiago, el organizador indica que el kit se recoge en la Expo durante los días previos. Los horarios finales del paquete deben confirmarse. Si vuelves el domingo, verifica que el vuelo sea compatible con terminar la carrera.",
    source: {
      label: "Maratón de Santiago · FAQ oficial",
      href: "https://maratondesantiago.cl/contacto/preguntas-frecuentes/",
    },
  },
  {
    category: "preparar",
    image: "/images/running-road.jpg",
    eyebrow: "CUIDAR EL PROCESO · 30 S",
    title: "Escuchar también\nes entrenar.",
    summary: "No conviertas el dolor en una meta que superar.",
    body: "Reserva espacio para descansar. Si correr te produce dolor, detente y consulta a un profesional si persiste o te preocupa. Estos consejos son informativos: no evalúan tu aptitud para correr 42K y no reemplazan atención o una preparación individual.",
    source: {
      label: "NHS · Dolor y lesiones al correr",
      href: "https://www.nhs.uk/live-well/exercise/knee-pain-and-other-running-injuries/",
    },
  },
  {
    category: "despues",
    image: "/images/running-team.jpg",
    eyebrow: "DESPUÉS DE LA META · 30 S",
    title: "Tu experiencia\nabre el camino.",
    summary: "Una foto, un consejo honesto y lo que mejorarías.",
    body: "Cuenta la carrera y edición, lo que te ayudó en la previa y cómo fue la experiencia del viaje. Comparte fotos propias o con autorización. Evita mostrar dorsales con datos privados, documentos o rostros de otras personas sin permiso. Las opiniones críticas también ayudan: las estrellas por compartir no dependerán de escribir una reseña positiva.",
  },
];

/** Collapsible column body: "+"/"−" marker and closed/open summary labels, as in the design. */
function Fold({ closed, open, children }: { closed: string; open: string; children: ReactNode }) {
  return (
    <details className="group/fold mt-4 border-t border-primary/15">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between py-3 text-xs font-semibold [&::-webkit-details-marker]:hidden">
        <span className="group-open/fold:hidden">{closed}</span>
        <span className="hidden group-open/fold:inline">{open}</span>
        <span aria-hidden className="text-2xl leading-none font-normal">
          <span className="group-open/fold:hidden">+</span>
          <span className="hidden group-open/fold:inline">−</span>
        </span>
      </summary>
      <div className="py-5">{children}</div>
    </details>
  );
}

export function BlogSection() {
  return (
    <section
      id="blog"
      aria-labelledby="blog-title"
      className="border-t border-primary/15 bg-background px-[6%] py-8 text-primary sm:px-[8%] sm:py-10"
    >
      <p className="mb-3 text-xs font-bold tracking-widest">INSPIRACIÓN PARA TU PRÓXIMA META</p>
      <h2
        id="blog-title"
        className="mb-3 font-heading text-5xl leading-none font-bold tracking-tight"
      >
        Blog runner.
      </h2>
      <p className="mb-7 text-sm">Historias que inspiran. Consejos para correr y viajar.</p>

      <div className="grid gap-6 md:grid-cols-2 md:gap-[6%]">
        <div id="referentes" className="border-t border-primary/15 pt-5">
          <h3 className="mb-3.5 font-heading text-3xl leading-tight font-bold">
            Referentes.
            <br />
            La pasión se contagia.
          </h3>
          <p className="text-xs">
            Daniela Zarfati · Karla Medina
            <br />
            Participaciones por confirmar.
          </p>
          <Fold closed="Conocer referentes" open="Cerrar referentes">
            <div className="grid gap-4">
              {REFERENTS.map(({ name, image, alt, disclaimer }, index) => (
                <article
                  key={name}
                  className={cn(
                    "relative isolate min-h-85 overflow-hidden rounded-sm text-primary-foreground",
                    index % 2 === 0 ? "bg-primary" : "bg-highlight",
                  )}
                >
                  <Image
                    src={image}
                    alt={alt}
                    fill
                    sizes="(min-width: 768px) 45vw, 100vw"
                    loading="lazy"
                    className="-z-20 object-cover"
                  />
                  <div
                    className={cn(
                      "absolute inset-0 -z-10 bg-linear-to-b from-35%",
                      index % 2 === 0 ? "from-primary/10 to-primary/90" : "from-highlight/10 to-highlight/90",
                    )}
                  />
                  <span
                    className={cn(
                      "absolute top-4 left-4 rounded-sm border border-primary-foreground/50 px-2.5 py-1.5 text-xs tracking-widest",
                      index % 2 === 0 ? "bg-primary/45" : "bg-highlight/45",
                    )}
                  >
                    PARTICIPACIÓN POR CONFIRMAR
                  </span>
                  <div className="absolute inset-x-5 bottom-6">
                    <span
                      className={cn(
                        "text-xs tracking-widest",
                        index % 2 === 0 ? "text-highlight" : "text-primary-foreground",
                      )}
                    >
                      {disclaimer}
                    </span>
                    <h4 className="mt-3 mr-9 font-heading text-5xl leading-none font-bold tracking-tight whitespace-pre-line">
                      {name}
                    </h4>
                    <ArrowUpRight
                      aria-hidden
                      className={cn(
                        "absolute right-0 bottom-0 size-8",
                        index % 2 === 0 ? "text-highlight" : "text-primary-foreground",
                      )}
                    />
                  </div>
                </article>
              ))}
            </div>
            <p className="mt-5 max-w-xl text-xs">
              Las fotos de Daniela Zarfati y Karla Medina son reales.
              Redes sociales pendientes de confirmar.
            </p>
          </Fold>
        </div>

        <div id="tips" className="border-t border-primary/15 pt-5">
          <h3 className="mb-3.5 font-heading text-3xl leading-tight font-bold">
            Tu próxima meta
            <br />
            también se aprende.
          </h3>
          <p className="text-xs">Consejos breves para tu próxima carrera.</p>
          <Fold closed="Explorar tips" open="Cerrar consejos">
            <TipList tips={TIPS} />
            <p className="mt-6 max-w-3xl text-xs">
              Información general, revisada el 17/10/2026. No es un plan personalizado ni
              garantiza resultados. Los detalles de cada carrera se verifican con su organizador.
              Para adaptar la preparación a tu salud y experiencia, consulta a profesionales
              cualificados.
            </p>
          </Fold>
        </div>
      </div>
    </section>
  );
}
