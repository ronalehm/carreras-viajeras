import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactPageContent, ContactPageLoading, SiteFooter, SiteHeader } from "@/modules/landing";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Consulta por tu próximo viaje con Carreras Viajeras.",
};

// Static (○): ?destino=, the attribution and the published trips are read in the browser.
// No form here: each race page has the only data form ("Pide información").
export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* useSearchParams in ContactPageContent: the prerendered HTML carries this fallback. */}
        <Suspense fallback={<ContactPageLoading />}>
          <ContactPageContent />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
