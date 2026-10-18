import { query } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await query<{ now: string }>("select now()::text as now");
    return Response.json({ db: "ok", now: rows[0].now });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ db: "error" }, { status: 503 });
  }
}
