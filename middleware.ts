import { clerkMiddleware } from "@clerk/nextjs/server";

// Only makes the Clerk session available to auth(); it never authorizes, redirects or reads
// the database. Guards on each page, Route Handler and Server Action decide access.
// Kept as Edge `middleware` (not `proxy`, which is Node-only) because it is the runtime
// OpenNext Cloudflare supports. Any new route that calls the guards must be added to the
// matcher; otherwise auth() throws and the guard fails closed with 401 (accounts-clerk-rbac D3).
export default clerkMiddleware();

export const config = {
  matcher: ["/crm/:path*", "/api/crm/:path*"],
};
