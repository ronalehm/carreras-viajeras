import Link from "next/link";
import type { HomeNews } from "../utils/homeNews";
import { NewsCard } from "./NewsCard";

export function NewsSection({ news }: { news: HomeNews }) {
  return <section id="noticias" aria-labelledby="news-title" className="bg-background px-[6%] py-18 text-primary sm:px-[8%] lg:py-28">
    <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
      <div><h2 id="news-title" className="display-title text-display-section">Noticias y novedades.</h2><p className="mt-4 max-w-[60ch] text-asphalt">Actualizaciones, historias y noticias para tu próxima meta.</p></div>
      <Link href="/noticias" className="font-semibold underline decoration-highlight underline-offset-4">Ver todas</Link>
    </div>
    {news.status === "ok" && <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{news.posts.map((post) => <NewsCard key={post.slug} post={post} />)}</div>}
    {news.status === "empty" && <p className="text-sm text-asphalt">Todavía no hay publicaciones.</p>}
    {news.status === "error" && <p role="status" className="text-sm text-asphalt">Las noticias no están disponibles en este momento. Vuelve a intentarlo más tarde.</p>}
  </section>;
}
