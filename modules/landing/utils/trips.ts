/** Fixed design content of `/` only (the trip page reads the catalog). raceDate, capacity and prices are a static copy. */
export type TripContent = {
  slug: string;
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
  };
  disclaimer: string;
};

// Literal texts from the design (index.html). Values are stored as displayed.
export const TRIPS: readonly TripContent[] = [
  {
    slug: "maraton-santiago-2027",
    image: "/images/cover-santiago.webp",
    imageAlt: "Corredores de trail corriendo por un paso de montaña con los nevados de fondo",
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
    },
    disclaimer:
      "Proveedores y condiciones por confirmar. Consulta sin compromiso; no se reciben pagos en la web.",
  },
];
