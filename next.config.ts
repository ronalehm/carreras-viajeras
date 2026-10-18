import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Workers Free has no IMAGES binding: serve public/images as static assets.
  images: { unoptimized: true },
};
export default nextConfig;

initOpenNextCloudflareForDev();
