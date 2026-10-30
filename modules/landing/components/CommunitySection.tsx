import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A sequence, so it keeps its numbering (Requisito 4). */
const STEPS = [
  { number: "01", label: "Conecta", title: "Encuentra tu equipo.", text: "Una comunidad alrededor de cada destino." },
  {
    number: "02",
    label: "Comparte",
    title: "Tu experiencia inspira.",
    text: "Consejos y recuerdos de quienes estuvieron ahí.",
  },
  {
    number: "03",
    label: "Suma",
    title: "Estrellas para tu próximo viaje.",
    text: "Por referidos con reserva confirmada y su primer pago válido.",
  },
];

/** Static community block: no persistence, only a CTA to /cuenta. */
export function CommunitySection() {
  return (
    <section
      id="comunidad"
      aria-labelledby="community-title"
      className="bg-night px-[6%] py-18 text-primary-foreground sm:px-[8%] lg:py-28"
    >
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-[6%]">
        <div>
          <h2 id="community-title" className="mb-6 display-title text-display-section">
            Corre. Comparte.
            <br />
            Vuelve a encontrarte.
          </h2>
          <p className="mb-8 max-w-[60ch] text-base leading-relaxed text-primary-foreground/75 sm:text-lg">
            Conecta con runners y comparte tu próxima historia.
          </p>
          <Link
            href="/cuenta#imagen-login"
            className={cn(
              buttonVariants(),
              "h-auto gap-2 rounded-full bg-highlight px-6 py-3.5 text-base font-semibold text-night hover:bg-background",
            )}
          >
            Ingresar / Registrarse <ArrowUpRight aria-hidden />
          </Link>
        </div>
        <div className="relative aspect-video overflow-hidden rounded-2xl md:aspect-4/3">
          <Image
            id="imagen-login"
            src="/images/running-team.webp"
            alt="Corredores juntos, imagen ilustrativa de la comunidad"
            fill
            sizes="(min-width: 768px) 42vw, 100vw"
            className="object-cover object-[center_55%]"
          />
        </div>
      </div>

      <ol className="mt-14 grid sm:grid-cols-3 sm:gap-8 lg:mt-20">
        {STEPS.map(({ number, label, title, text }) => (
          <li key={number} className="border-t border-primary-foreground/20 py-6">
            <p className="flex items-baseline gap-2 text-sm font-semibold text-primary-foreground/75">
              <span className="display-title text-5xl text-highlight">{number}</span> / {label}
            </p>
            <h3 className="mt-4 mb-2 display-title text-3xl leading-none lg:text-4xl">{title}</h3>
            <p className="max-w-[40ch] text-sm leading-relaxed text-primary-foreground/75 sm:text-base">
              {text}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-6 border-t border-primary-foreground/20 pt-8 md:grid md:grid-cols-[1fr_1.4fr] md:gap-[6%]">
        <h3 className="mb-3 display-title text-3xl leading-none lg:text-4xl">
          Invita a tu próximo compañero de carrera.
        </h3>
        <div>
          <p className="mb-5 max-w-[60ch] text-sm leading-relaxed text-primary-foreground/75 sm:text-base">
            Comparte tu enlace desde Mi cuenta. Consulta allí las reglas vigentes, las estrellas
            por referido y los premios disponibles antes de participar. Las recompensas
            dependen de las condiciones publicadas por administración.
          </p>
          <span className="inline-block rounded-full border border-primary-foreground/35 px-3.5 py-1.5 text-sm font-medium">
            Consulta las condiciones en Mi cuenta
          </span>
        </div>
      </div>
    </section>
  );
}
