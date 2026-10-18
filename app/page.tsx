import type { Metadata } from "next";
import {
  BlogSection,
  DestinationsSection,
  FaqSection,
  HeroCarousel,
  MobileCta,
  PackageSection,
  SiteFooter,
  SiteHeader,
  StorySection,
  TRIPS,
  TripFacts,
  WhyUsSection,
} from "@/modules/landing";

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
        <TripFacts trip={TRIPS[0]} />
        <StorySection />
        <PackageSection />
        <WhyUsSection />
        <BlogSection />
        <DestinationsSection />
        <FaqSection />
      </main>
      <SiteFooter />
      <MobileCta />
    </>
  );
}
