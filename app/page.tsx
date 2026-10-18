import type { Metadata } from "next";
import { HeroCarousel, MobileCta, SiteFooter, SiteHeader } from "@/modules/landing";

// The layout's title.template doesn't apply to a page in its own segment.
export const metadata: Metadata = {
  title: { absolute: "Tu próxima meta es la maratón de Santiago. | Carreras Viajeras" },
};

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroCarousel />
      </main>
      <SiteFooter />
      <MobileCta />
    </>
  );
}
