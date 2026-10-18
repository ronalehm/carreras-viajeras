import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "01 / CONECTA", title: "Encuentra tu equipo.", text: "Una comunidad alrededor de cada destino." },
  {
    label: "02 / COMPARTE",
    title: "Tu experiencia inspira.",
    text: "Consejos y recuerdos de quienes estuvieron ahí.",
  },
  {
    label: "03 / SUMA",
    title: "Estrellas para tu próximo viaje.",
    text: "Por participar en eventos y compartir experiencias.",
  },
];

/** Static community block: no persistence, only a CTA to /cuenta. */
export function CommunitySection() {
  return (
    <section
      id="comunidad"
      aria-labelledby="community-title"
      className="border-t border-primary/15 px-[6%] py-8 text-primary sm:px-[8%] sm:py-10"
    >
      <div className="grid items-center gap-6 md:grid-cols-2 md:gap-[6%]">
        <div>
          <h2
            id="community-title"
            className="mb-4 font-heading text-4xl leading-none font-bold tracking-tight sm:text-5xl"
          >
            Corre. Comparte.
            <br />
            <em className="not-italic underline decoration-highlight decoration-3 underline-offset-[6px]">
              Vuelve a encontrarte.
            </em>
          </h2>
          <p className="mb-5 text-sm leading-relaxed">
            Conecta con runners y comparte tu próxima historia.
          </p>
          <Link
            href="/cuenta"
            className={cn(
              buttonVariants(),
              "h-auto gap-1.5 rounded-sm px-5 py-3 text-xs font-bold shadow-[inset_0_-4px_0_var(--highlight)] sm:text-sm",
            )}
          >
            Ingresar / Registrarse <ArrowUpRight aria-hidden />
          </Link>
        </div>
        <div className="relative h-48 overflow-hidden rounded-sm md:h-65">
          <Image
            src="/images/running-team.jpg"
            alt="Corredores juntos, imagen ilustrativa de la comunidad"
            fill
            sizes="(min-width: 768px) 42vw, 100vw"
            className="object-cover object-[center_55%]"
          />
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-3 sm:gap-6">
        {STEPS.map(({ label, title, text }, index) => (
          <div
            key={label}
            className={cn("border-t-3 pt-5", index % 2 === 0 ? "border-highlight" : "border-primary")}
          >
            <span
              className={cn(
                "text-xs tracking-[0.15em]",
                index % 2 === 0 ? "text-highlight" : "text-primary",
              )}
            >
              {label}
            </span>
            <h3 className="mt-3 mb-1 text-lg font-bold">{title}</h3>
            <p className="text-xs leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t border-primary/15 pt-6">
        <h3 className="mb-2 text-base font-bold">Participar + compartir = sumar.</h3>
        <p className="mb-4 max-w-2xl text-sm leading-relaxed">
          Las estrellas reconocerán ambas acciones, una vez validadas. Los descuentos,
          equivalencias, vigencia y condiciones de canje aún están por definir.
        </p>
        <span className="inline-block border border-primary/25 p-2 text-xs tracking-widest">
          SIN DESCUENTOS ACTIVOS TODAVÍA
        </span>
      </div>
    </section>
  );
}
