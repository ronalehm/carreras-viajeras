import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { esMX } from "@clerk/localizations";
import "./globals.css";
import localFont from "next/font/local";
import { ClarityAnalytics } from "@/components/shared/ClarityAnalytics";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";

// Fonts are served from the repository (latin subset, variable woff2 from Google Fonts, SIL OFL)
// so the build never depends on fonts.googleapis.com being reachable.
const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin-wght.woff2",
  weight: "400 800",
  style: "normal",
  display: "swap",
  variable: "--font-sans",
});

// Variable display face for home headlines; the wdth axis enables the condensed bib style.
const archivo = localFont({
  src: "./fonts/archivo-latin-wdth-wght.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
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
          <Providers>
            {children}
            <ClarityAnalytics />
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
