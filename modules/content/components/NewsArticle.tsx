import Image from "next/image";
import Link from "next/link";
import type { PublicPost } from "../types/content.types";
import { CONTENT_CATEGORY_LABELS, formatContentDate } from "../utils/contentDisplay";

export function NewsArticle({ post }: { post: PublicPost }) {
  return <article className="mx-auto max-w-3xl px-5 py-12 text-primary sm:py-18">
    <Link href="/noticias" className="text-sm underline underline-offset-4">Todas las noticias</Link>
    <p className="mt-8 text-sm text-asphalt">{CONTENT_CATEGORY_LABELS[post.category]} · <time dateTime={post.publishedAt.toISOString()}>{formatContentDate(post.publishedAt)}</time></p>
    <h1 className="display-title mt-4 text-4xl leading-tight sm:text-6xl">{post.title}</h1>
    <p className="mt-6 text-lg leading-relaxed text-asphalt">{post.summary}</p>
    {post.imageUrl && <div className="relative mt-8 aspect-video overflow-hidden rounded-2xl"><Image src={post.imageUrl} alt={post.imageAlt ?? ""} fill sizes="(min-width: 768px) 768px, 100vw" className="object-cover" /></div>}
    <div className="mt-10 space-y-6 text-base leading-relaxed text-asphalt">{post.body.split(/\n\s*\n/).filter((p) => p.trim()).map((paragraph, i) => <p key={i} className="whitespace-pre-line break-words">{paragraph}</p>)}</div>
  </article>;
}
