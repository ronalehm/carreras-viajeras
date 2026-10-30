import { getHomeNews } from "@/modules/content";

const NO_STORE = { "Cache-Control": "no-store" };

// Public home news, read in the browser so `/` stays a static page. Takes no parameters:
// any query string is ignored. A failed read answers 503 with a fixed code, never the cause.
export async function GET() {
  const news = await getHomeNews();
  if (news.status === "error") {
    return Response.json({ error: "news_unavailable" }, { status: 503, headers: NO_STORE });
  }
  return Response.json({ posts: news.status === "ok" ? news.posts : [] }, { headers: NO_STORE });
}
