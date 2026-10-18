import { parseDestinationId } from "../utils/inquiry";
import { ContactForm } from "./ContactForm";

export function ContactSection({ destination }: { destination?: string | string[] }) {
  const defaultDestination = parseDestinationId(destination);

  return (
    <section
      id="quiero-ir"
      className="grid min-h-[65vh] gap-6 px-[6%] py-9 text-primary sm:grid-cols-[1fr_1.1fr] sm:gap-[5%] sm:px-[8%] sm:py-16 lg:gap-[8%]"
    >
      <div>
        <p className="mb-6 text-xs font-bold tracking-[0.2em]">EL PRIMER PASO ES DECIDIRTE</p>
        <h1 className="mb-6 font-heading text-5xl leading-none font-bold tracking-tight lg:text-7xl">
          Tu próxima historia
          <br />
          empieza aquí.
        </h1>
        <p className="text-sm leading-relaxed">
          Cuéntanos qué destino tienes en mente.
          <br />
          Sin pagos. Sin compromiso de reserva.
        </p>
        <div className="mt-9 max-w-sm border-l-2 border-primary/25 pl-4 text-xs font-bold tracking-wider">
          VISTA DE DEMOSTRACIÓN
          <span className="mt-1.5 block font-normal tracking-normal">
            Los datos no se envían ni se guardan. Puedes preparar y copiar tu consulta; el canal
            comercial está pendiente de activar.
          </span>
        </div>
      </div>
      {/* key: al navegar a otro ?destino= sin desmontar, el formulario vuelve a su valor inicial. */}
      <ContactForm key={defaultDestination} defaultDestination={defaultDestination} />
    </section>
  );
}
