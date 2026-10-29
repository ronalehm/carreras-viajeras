import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { esMX } from "@clerk/localizations";
import "./globals.css";
import { Archivo, Plus_Jakarta_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

// Variable display face for home headlines; the wdth axis enables the condensed bib style.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: { default: "Carreras Viajeras", template: "%s | Carreras Viajeras" },
  description:
    "Corre la Maratón de Santiago 42K 2027 con Carreras Viajeras. Propuesta de viaje para runners peruanos: vuelos, alojamiento e inscripción en preventa: US$1,499 al contado o US$1,799 en cuotas.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0244a9" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={cn("font-sans", jakarta.variable, archivo.variable)}
    >
      <body>
        <ClerkProvider localization={esMX}>
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
