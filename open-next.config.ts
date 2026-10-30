import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Workers Free limita cada petición a 10 ms de CPU: las páginas estáticas se sirven desde la
// caché de assets (copiada en `build:worker`) e interceptadas antes de cargar el servidor Next.
// Es de solo lectura (sin ISR ni revalidación) y no usa R2, que requiere un medio de pago.
// Ver https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
