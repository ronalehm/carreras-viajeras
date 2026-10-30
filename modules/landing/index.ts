export { AccountSection } from "./components/AccountSection";
export { BlogSection } from "./components/BlogSection";
export { CommunitySection } from "./components/CommunitySection";
export { ContactPageContent, ContactPageLoading } from "./components/ContactPageContent";
export { DestinationsSection } from "./components/DestinationsSection";
export { FaqSection } from "./components/FaqSection";
export { HeroCarousel } from "./components/HeroCarousel";
export { MobileCta } from "./components/MobileCta";
export { PackageSection } from "./components/PackageSection";
export { RacePageContent } from "./components/RacePageContent";
export { ScrollToHero } from "./components/ScrollToHero";
export { SiteFooter } from "./components/SiteFooter";
export { MazBackingSection } from "./components/MazBackingSection";
export { SiteBrand, SiteHeader } from "./components/SiteHeader";
export { StorySection } from "./components/StorySection";
export { TripFacts } from "./components/TripFacts";
export { TripPageContent, TripPageLoading } from "./components/TripPageContent";
export { WhyUsSection } from "./components/WhyUsSection";
// Server-only reads for GET /api/viajes/[slug]; the race pages read that endpoint in the browser.
export { getCatalogTrip } from "./utils/catalogTrip";
// Offer in force of a published race (slug + ?c= only); null → no price block, no amounts.
export { getCatalogOffer } from "./utils/catalogOffer";
export { TRIPS } from "./utils/trips";

export { buildWhatsAppUrl, firstParam, WHATSAPP_NUMBER } from "./utils/inquiry";
