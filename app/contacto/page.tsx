import type { Metadata } from "next";
import { ContactSection, SiteFooter, SiteHeader } from "@/modules/landing";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Consulta por tu próximo viaje con Carreras Viajeras.",
};

export default async function ContactPage({ searchParams }: PageProps<"/contacto">) {
  const { destino } = await searchParams;

  return (
    <>
      <SiteHeader />
      <main>
        <ContactSection destination={destino} />
      </main>
      <SiteFooter />
    </>
  );
}
