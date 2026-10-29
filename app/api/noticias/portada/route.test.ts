// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getHomeNews } = vi.hoisted(() => ({ getHomeNews: vi.fn() }));
vi.mock("@/modules/content", () => ({ getHomeNews }));

import { GET } from "@/app/api/noticias/portada/route";
import type { PublicPost } from "@/modules/content";

const post: PublicPost = {
  slug: "nueva-carrera", category: "news", title: "Nueva carrera", summary: "Una noticia importante.",
  body: "Cuerpo de la publicación.", imageUrl: null, imageAlt: null, publishedAt: new Date("2026-10-29T15:00:00Z"),
};

async function expectResponse(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual(body);
}

beforeEach(() => {
  getHomeNews.mockReset();
});

describe("GET /api/noticias/portada", () => {
  it("returns the published posts with publishedAt in ISO 8601", async () => {
    getHomeNews.mockResolvedValue({ status: "ok", posts: [post] });

    await expectResponse(await GET(), 200, { posts: [{ ...post, publishedAt: "2026-10-29T15:00:00.000Z" }] });
  });

  it("returns 200 with an empty list when nothing is published", async () => {
    getHomeNews.mockResolvedValue({ status: "empty" });

    await expectResponse(await GET(), 200, { posts: [] });
  });

  it("returns 503 with a fixed code and no internal detail when the read fails", async () => {
    getHomeNews.mockResolvedValue({ status: "error" });

    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.text()).resolves.toBe(JSON.stringify({ error: "news_unavailable" }));
  });

  it("ignores any query string: the handler takes no request", async () => {
    getHomeNews.mockResolvedValue({ status: "ok", posts: [post] });
    // As Next calls it: a request with parameters that try to widen or change the read.
    const handler: (request: Request) => Promise<Response> = GET;

    const response = await handler(new Request("https://carreras-viajeras.mentec.dev/api/noticias/portada?limit=50&status=draft"));
    await expectResponse(response, 200, { posts: [{ ...post, publishedAt: "2026-10-29T15:00:00.000Z" }] });
    expect(GET).toHaveLength(0);
    expect(getHomeNews).toHaveBeenCalledExactlyOnceWith();
  });
});
