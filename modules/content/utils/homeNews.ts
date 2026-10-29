import "server-only";
import { listPublishedPosts } from "../services/content.service";
import type { PublicPost } from "../types/content.types";

export type HomeNews = { status: "ok"; posts: PublicPost[] } | { status: "empty" } | { status: "error" };
export async function getHomeNews(): Promise<HomeNews> {
  try {
    const { posts } = await listPublishedPosts({ limit: 3 });
    return posts.length ? { status: "ok", posts } : { status: "empty" };
  } catch {
    console.error("content: home news unavailable");
    return { status: "error" };
  }
}
