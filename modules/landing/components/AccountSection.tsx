import Image from "next/image";
import { RunnerAccount } from "@/modules/accounts";

/** Column of cuenta.html plus the runner panel. The panel provides the page's only h1. */
export function AccountSection() {
  return (
    <div className="grid text-primary md:min-h-[calc(100vh-6rem)] md:grid-cols-2">
      <div className="relative isolate flex min-h-65 items-end bg-primary text-primary-foreground md:min-h-162">
        <Image
          src="/images/running-team.webp"
          alt="Corredores juntos, imagen ilustrativa"
          fill
          preload
          sizes="(min-width: 768px) 50vw, 100vw"
          className="-z-20 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-primary/20 to-primary/90" />
        <div className="px-[6%] py-9 md:px-[10%] md:py-15">
          <p className="mb-4 text-xs font-bold tracking-[0.2em] md:mb-6">
            TU PASAPORTE A MÁS HISTORIAS
          </p>
          <p className="mb-4 font-heading text-5xl leading-none font-bold tracking-tight lg:text-7xl">
            El próximo viaje
            <br />
            empieza contigo.
          </p>
          <p className="text-sm">Participa. Comparte. Conecta.</p>
          <span className="mt-4 hidden text-xs tracking-widest md:block">
            ★ TU COMUNIDAD, TUS CARRERAS, TUS BENEFICIOS
          </span>
        </div>
      </div>

      <div className="self-center px-[7%] pt-9 pb-14 md:max-w-170 md:px-[8%] md:py-14 lg:px-[12%]">
        <p className="mb-6 text-xs font-bold tracking-[0.2em]">COMUNIDAD CARRERAS VIAJERAS</p>
        <RunnerAccount />
        <p className="mt-6 text-xs leading-relaxed">
          Consulta tus carreras y beneficios desde Mi cuenta. Las estrellas por referidos y
          los canjes dependen de las reglas y los premios vigentes del programa.
        </p>
      </div>
    </div>
  );
}
