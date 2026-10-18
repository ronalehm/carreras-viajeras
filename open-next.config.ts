import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sin caché incremental en R2 por ahora: R2 requiere un medio de pago en la cuenta.
// Ver https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig({});
