import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter, SiteHeader, TripPageContent, TripPageLoading } from "@/modules/landing";

// Generic: the trip title is set in the browser; there is no Open Graph image per trip.
export const metadata: Metadata = {
  title: "Viaje",
  description: "Viaje para correr con Carreras Viajeras.",
};

// Static (○) shell of /viajes/<slug>, reached through a rewrite in next.config.ts (the segment has
// an underscore, which no trip slug can have). The trip, the offer and ?c= are read in the browser.
export default function TripShellPage() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* useSearchParams in TripPageContent: the prerendered HTML carries this fallback. */}
        <Suspense fallback={<TripPageLoading />}>
          <TripPageContent />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
