import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/modules/landing";
import { CONTENT_CATEGORY_LABELS, contentQuerySchema, listPublishedPosts, NewsCard } from "@/modules/content";

export const metadata: Metadata = { title: "Noticias y novedades", description: "Noticias, actualizaciones e historias de Carreras Viajeras." };
export default async function NewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filter = contentQuerySchema.parse(await searchParams);
  let result: Awaited<ReturnType<typeof listPublishedPosts>> | null;
  try { result = await listPublishedPosts(filter); } catch { result = null; }
  const href = (page: number) => `/noticias?${new URLSearchParams({ page: String(page), ...(filter.category && { category: filter.category }) })}`;
  return <><SiteHeader /><main className="mx-auto max-w-7xl px-[6%] py-12 text-primary sm:py-18">
    <h1 className="display-title text-display-section">Noticias y novedades.</h1>
    <nav aria-label="Categorías de noticias" className="my-8 flex flex-wrap gap-5 text-sm">
      <Link href="/noticias" aria-current={!filter.category ? "page" : undefined} className="underline underline-offset-4">Todas</Link>
      {Object.entries(CONTENT_CATEGORY_LABELS).map(([key, label]) => <Link key={key} href={`/noticias?category=${key}`} aria-current={filter.category === key ? "page" : undefined} className="underline underline-offset-4">{label}</Link>)}
    </nav>
    {result === null ? <p role="status">Las noticias no están disponibles en este momento. Vuelve a intentarlo más tarde.</p>
      : result.posts.length === 0 ? <p>Todavía no hay publicaciones en esta selección.</p>
        : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{result.posts.map((post) => <NewsCard key={post.slug} post={post} />)}</div>}
    {result && <nav aria-label="Paginación de noticias" className="mt-10 flex justify-between gap-5">
      {result.page > 1 ? <Link href={href(result.page - 1)} className="underline">Anterior</Link> : <span />}
      {result.hasMore && <Link href={href(result.page + 1)} className="underline">Siguiente</Link>}
    </nav>}
  </main><SiteFooter /></>;
}
