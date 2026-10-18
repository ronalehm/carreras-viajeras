import type { ReactNode } from "react";

const FAQS: { question: string; answer: ReactNode }[] = [
  {
    question: "¿La fecha de Santiago 2027 está confirmada?",
    answer: (
      <>
        El sitio oficial anuncia el 16 de mayo de 2027 y AIMS publica la misma fecha. Verificado el
        17 de octubre de 2026. Cualquier cambio depende del organizador.{" "}
        <a
          href="https://maratondesantiago.cl/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          Consultar sitio oficial
        </a>
        .
      </>
    ),
  },
  {
    question: "¿El paquete es para maratón o media maratón?",
    answer:
      "El paquete corredor está dirigido exclusivamente a la Maratón de Santiago 42K. La mención “media maratón” del material de referencia no aplica a esta oferta.",
  },
  {
    question: "¿Qué incluye el paquete de preventa?",
    answer:
      "Según el afiche, incluye inscripción, vuelos Lima–Santiago–Lima, 3 noches en hotel de 4 estrellas cercano a la partida, desayuno, traslados aeropuerto–hotel–aeropuerto, traslado y acompañamiento grupal a la Expo y a la partida, seguro médico de viaje y tarjeta de metro. Proveedores y condiciones operativas aún deben confirmarse. El merchandising de la propuesta inicial está pendiente de ratificar.",
  },
  {
    question: "¿Qué gastos no están incluidos?",
    answer:
      "Tours y actividades turísticas adicionales; almuerzos, cenas y consumos personales. El equipaje, las tasas y el saldo de la tarjeta de metro deben precisarse en el desglose final antes de contratar.",
  },
  {
    question: "¿El seguro cubre mi participación en la maratón?",
    answer:
      "El afiche ofrece seguro médico de viaje, pero no especifica cobertura para entrenamiento o competencia. Aseguradora, póliza, vigencia, límites, deducibles y exclusiones deben confirmarse antes de contratar; no se garantiza cobertura deportiva en esta página.",
  },
  {
    question: "¿Dejar mis datos asegura uno de los 100 cupos?",
    answer:
      "No. Los 100 cupos son la capacidad inicial propuesta del grupo, no un contador de plazas disponibles. Tu solicitud expresa interés; no reserva ni garantiza inscripción.",
  },
  {
    question: "¿Puedo viajar solo o con un acompañante?",
    answer:
      "Sí. El paquete corredor es para 42K y el afiche anuncia acompañante a US$1,300. Las inclusiones específicas del acompañante, ocupación de habitación y condiciones están pendientes de confirmar; esa tarifa no garantiza inscripción a la carrera. Para grupos ofrecemos cotización personalizada.",
  },
  {
    question: "¿Cómo se paga? ¿Puedo cancelar?",
    answer:
      "El afiche anuncia US$1,499 al contado, US$1,799 como precio total en cuotas y US$300 para reservar. El saldo debe estar totalmente pagado en febrero de 2027; el día límite, número y calendario de cuotas, medios de pago, aplicación de la reserva al precio total, vigencia de preventa y políticas de cambios, cancelación y reembolso están pendientes de definir. No se reciben pagos en esta web; consulta las condiciones antes de pagar.",
  },
  {
    question: "¿Qué documentos necesito para viajar?",
    answer:
      "Los requisitos dependen de tu nacionalidad, documento y situación migratoria. Confírmalos con las autoridades de Chile y tu aerolínea antes de comprar; esta página no garantiza la admisión al país.",
  },
];

export function FaqSection() {
  return (
    <section
      id="preguntas"
      className="grid gap-6 border-t border-primary/15 px-[6%] py-8 text-primary sm:px-[8%] sm:py-10 md:grid-cols-[1fr_1.4fr] md:gap-[7%]"
    >
      <div>
        <p className="mb-3 text-xs font-bold tracking-[0.15em]">05 / RESUELVE TUS DUDAS</p>
        <h2 className="font-heading text-4xl leading-none font-bold tracking-tight sm:text-5xl">
          Resolvamos
          <br />
          esas dudas.
        </h2>
      </div>
      <div>
        {FAQS.map(({ question, answer }) => (
          <details key={question} className="group border-b border-primary/25 py-5">
            <summary className="relative cursor-pointer list-none pr-8 text-sm font-semibold after:absolute after:top-1/2 after:right-0 after:-translate-y-1/2 after:text-xl after:font-normal after:content-['+'] group-open:after:content-['−'] [&::-webkit-details-marker]:hidden">
              {question}
            </summary>
            <p className="mt-4 text-sm leading-relaxed">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
