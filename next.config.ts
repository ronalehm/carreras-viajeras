import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Static shell of the race pages: its segment has an underscore, which tripSlugSchema rejects, so
// it never collides with a catalog slug and the rewrite sources below never match it.
const TRIP_SHELL = "/viajes/ficha_viaje";

const nextConfig: NextConfig = {
  // Workers Free has no IMAGES binding: serve public/images as static assets.
  images: { unoptimized: true },
  // /viajes/<slug> and /viajes/<slug>/registro are served from one prerendered shell (○) that
  // OpenNext answers from the static assets cache; the browser keeps the URL (and its query: ?c=,
  // ?modo=, UTM) and reads the trip from GET /api/viajes/[slug]. Only /viajes/* sources: /api/*,
  // /_next/* and public files are never rewritten.
  async rewrites() {
    return [
      { source: "/viajes/:slug([a-z0-9-]+)", destination: TRIP_SHELL },
      { source: "/viajes/:slug([a-z0-9-]+)/registro", destination: `${TRIP_SHELL}/registro` },
    ];
  },
};
export default nextConfig;

initOpenNextCloudflareForDev();
