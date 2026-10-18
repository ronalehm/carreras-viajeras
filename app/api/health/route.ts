// Public liveness only. Database readiness is a separate operational check.
export async function GET() {
  return Response.json({ status: "ok" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
