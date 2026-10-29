import type { Metadata } from "next";
import { Suspense } from "react";
import { submitWebLeadAction } from "@/modules/crm";
import { ContactPageContent, ContactPageLoading, SiteFooter, SiteHeader } from "@/modules/landing";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Consulta por tu próximo viaje con Carreras Viajeras.",
};

// Static (○): ?destino=, the attribution and the published trips are read in the browser.
export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* useSearchParams in ContactPageContent: the prerendered HTML carries this fallback. */}
        <Suspense fallback={<ContactPageLoading />}>
          {/* The action comes from crm and is passed as a prop: landing never imports crm at runtime. */}
          <ContactPageContent action={submitWebLeadAction} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
