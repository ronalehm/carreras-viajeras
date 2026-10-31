import Image from "next/image";
import { CalendarCheck, Flag, Globe, Users } from "lucide-react";

const MAZ_METRICS = [
  { value: "+25 años", label: "Experiencia en producción de maratones", Icon: CalendarCheck },
  { value: "+70", label: "Carreras producidas", Icon: Flag },
  { value: "+500", label: "Runners", Icon: Users },
  { value: "+15", label: "Maratones internacionales", Icon: Globe },
];

/** MAZ Producciones backing: home page only, right above the footer, in a compact band. */
export function MazBackingSection() {
  return (
    <aside
      aria-label="Respaldo de MAZ Producciones"
      className="border-t border-primary/10 bg-background px-[6%] py-10 text-primary sm:px-[8%] lg:py-12"
    >
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12">
        <div className="flex items-center gap-5 lg:w-2/5 lg:shrink-0">
          <Image
            src="/images/maz-producciones.webp"
            alt="MAZ Producciones"
            width={480}
            height={350}
            className="h-14 w-auto object-contain sm:h-16"
          />
          <div>
            <p className="text-xs font-semibold tracking-wide text-asphalt uppercase">El equipo detrás del viaje</p>
            <h2 className="mt-1 display-title text-2xl leading-tight lg:text-3xl">Una unidad de MAZ PRODUCCIONES</h2>
            <p className="mt-1 text-sm text-asphalt">Carreras Viajeras · Corre. Viaja. Conecta.</p>
          </div>
        </div>
        <div
          role="group"
          aria-label="Trayectoria de MAZ Producciones en 2025"
          className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {MAZ_METRICS.map(({ value, label, Icon }) => (
            <div key={value} className="rounded-xl bg-sky px-4 py-3">
              <p className="flex items-center gap-2 display-title text-3xl leading-none">
                <Icon aria-hidden className="size-4 shrink-0 stroke-[1.75] text-highlight" />
                {value}
              </p>
              <p className="mt-1.5 text-xs leading-snug font-medium text-asphalt">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-6 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-primary/10 pt-3 text-xs text-asphalt">
        <span className="font-semibold text-primary">MAZ PRODUCCIONES Y MAZ S.A.C. · RUC 20601664934</span>
        <span>Datos de trayectoria 2025 proporcionados por MAZ Producciones.</span>
      </p>
    </aside>
  );
}
