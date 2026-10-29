import { beforeEach, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));

import { fetchHomeNews } from "./homeNews.api";

const wirePost = {
  slug: "nueva-carrera", category: "news", title: "Nueva carrera", summary: "Una noticia importante.",
  body: "Cuerpo de la publicación.", imageUrl: null, imageAlt: null, publishedAt: "2026-10-29T15:00:00.000Z",
};

beforeEach(() => {
  get.mockReset();
});

it("requests the public endpoint and converts publishedAt to a Date", async () => {
  get.mockResolvedValue({ data: { posts: [wirePost] } });

  const posts = await fetchHomeNews();

  expect(get).toHaveBeenCalledExactlyOnceWith("/noticias/portada");
  expect(posts).toEqual([{ ...wirePost, publishedAt: new Date("2026-10-29T15:00:00.000Z") }]);
  expect(posts[0].publishedAt).toBeInstanceOf(Date);
});

it("accepts an empty list", async () => {
  get.mockResolvedValue({ data: { posts: [] } });

  await expect(fetchHomeNews()).resolves.toEqual([]);
});

it.each([
  ["a body without posts", { error: "news_unavailable" }],
  ["an unknown category", { posts: [{ ...wirePost, category: "internal" }] }],
  ["a missing publishedAt", { posts: [{ ...wirePost, publishedAt: null }] }],
  ["an invalid publishedAt", { posts: [{ ...wirePost, publishedAt: "ayer" }] }],
  ["more than three posts", { posts: [wirePost, wirePost, wirePost, wirePost] }],
])("rejects a malformed response: %s", async (_, data) => {
  get.mockResolvedValue({ data });

  await expect(fetchHomeNews()).rejects.toThrow();
});

it("propagates a failed request (503) so the section shows the fixed notice", async () => {
  get.mockRejectedValue(new Error("Request failed with status code 503"));

  await expect(fetchHomeNews()).rejects.toThrow();
});
