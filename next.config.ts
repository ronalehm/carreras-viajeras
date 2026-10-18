import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Next traces pg-cloudflare with Node conditions (only dist/empty.js); the
  // Worker bundle resolves its "workerd" export, so ship the real socket too.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pg-cloudflare/dist/**", "./node_modules/pg-cloudflare/esm/**"],
  },
};

export default nextConfig;

// Expone los bindings de Cloudflare (p. ej. D1) a `next dev` vía getCloudflareContext()
initOpenNextCloudflareForDev();
