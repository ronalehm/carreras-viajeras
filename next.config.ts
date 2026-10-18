import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Expone los bindings de Cloudflare (p. ej. D1) a `next dev` vía getCloudflareContext()
initOpenNextCloudflareForDev();
