import type { DestinationId } from "./inquiry";

/** Fixed design content. raceDate, capacity and prices.cash are the static copy shown on `/`. */
export type TripContent = {
  slug: string;
  destinationId: DestinationId;
  image: string;
  imageAlt: string;
  /** Line breaks with "\n" (rendered with whitespace-pre-line). */
  coverLabel: string;
  raceDate: string;
  officialUrl: string;
  route: string;
  routeNote: string;
  capacity: string;
  capacityNote: string;
  highlights: string[];
  prices: {
    cash: string;
    installmentsTotal: string;
    reservation: string;
    companion: string;
    companionNote: string;
    paymentNote: string;
  };
  included: { title: string; text: string }[];
  excluded: string[];
  /** Paragraphs of "Detalles que falta confirmar". */
  pendingDetails: string[];
  disclaimer: string;
};

/** What the trip page renders: fixed content with the catalog fields applied. */
export type Trip = TripContent & { name: string; description: string };

// Literal texts from the design (index.html). Values are stored as displayed.
export const TRIPS: readonly TripContent[] = [
  {
    slug: "maraton-santiago-2027",
    destinationId: "santiago-2027",
    image: "/images/santiago.jpg",
    imageAlt: "Vista ilustrativa de Santiago y la cordillera",
    coverLabel: "SANTIAGO 2027\nMARATÓN · 42K",
    raceDate: "16 mayo 2027",
    officialUrl: "https://maratondesantiago.cl/",
    route: "Lima → Santiago",
    routeNote: "Ida y vuelta · horarios por confirmar",
    capacity: "100 cupos definidos",
    capacityNote: "No es disponibilidad en tiempo real",
    highlights: [
      "Vuelos Lima ↔ Santiago",
      "3 noches · hotel 4 estrellas",
      "Inscripción a los 42K",
      "Desayuno y traslados",
    ],
    prices: {
      cash: "US$1,499",
      installmentsTotal: "US$1,799",
      reservation: "US$300",
      companion: "US$1,300",
      companionNote:
        "Alcance del paquete por confirmar; sin inscripción de corredor garantizada.",
      paymentNote:
        "Montos del paquete corredor 42K y tarifa de acompañante según corresponda. Saldo totalmente pagado en febrero de 2027. Día límite, número y calendario de cuotas, vigencia de preventa y condiciones de reserva pendientes de definir. La web no recibe pagos.",
    },
    included: [
      { title: "Inscripción", text: "A la Maratón de Santiago, distancia 42K." },
      { title: "Vuelos ida y vuelta", text: "Lima → Santiago → Lima." },
      {
        title: "3 noches de alojamiento",
        text: "Hotel de 4 estrellas, cercano al punto de partida.",
      },
      { title: "Desayuno", text: "Incluido durante la estadía del paquete." },
      {
        title: "Traslados de aeropuerto",
        text: "Aeropuerto de Santiago → hotel → aeropuerto.",
      },
      {
        title: "Expo en grupo",
        text: "Traslado y acompañamiento grupal, en horarios establecidos.",
      },
      {
        title: "Camino a la partida",
        text: "Traslado, acompañamiento y ubicación en el punto de partida.",
      },
      {
        title: "Seguro médico de viaje",
        text: "Aseguradora, límites, exclusiones y cobertura deportiva por confirmar.",
      },
      {
        title: "Tarjeta de metro",
        text: "Para movilidad en Santiago; carga o saldo incluido por precisar.",
      },
    ],
    excluded: [
      "Tours o actividades turísticas adicionales.",
      "Almuerzos, cenas y consumos personales.",
    ],
    pendingDetails: [
      "Aerolínea, fechas y horarios, equipaje y tasas; nombre y ubicación del hotel, ocupación de habitación y horario de desayuno; asignación efectiva de inscripción; horarios y alcance de traslados, acceso al punto de partida según el organizador; póliza de seguro y cobertura para correr la maratón; y saldo de la tarjeta de metro.",
      "El merchandising figuraba en la propuesta inicial y no aparece en el afiche actualizado: su inclusión está pendiente de ratificar.",
    ],
    disclaimer:
      "Proveedores y condiciones por confirmar. Consulta sin compromiso; no se reciben pagos en la web.",
  },
];

export function getTrip(slug: string): TripContent | undefined {
  return TRIPS.find((trip) => trip.slug === slug);
}
