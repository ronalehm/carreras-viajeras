import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Barlow_Condensed, DM_Sans } from "next/font/google";
import { cn } from "@/lib/utils";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: { default: "Carreras Viajeras", template: "%s | Carreras Viajeras" },
  description:
    "Corre la Maratón de Santiago 42K 2027 con Carreras Viajeras. Propuesta de viaje para runners peruanos: vuelos, alojamiento e inscripción en preventa: US$1,499 al contado o US$1,799 en cuotas.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0144ae" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={cn("font-sans", dmSans.variable, barlowCondensed.variable)}
    >
      <body>{children}</body>
    </html>
  );
}
