// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../services/content.service", () => ({ listPublishedPosts: vi.fn() }));
import { listPublishedPosts } from "../services/content.service";
import { getHomeNews } from "./homeNews";
afterEach(() => vi.restoreAllMocks());
it("returns real empty state separately from unavailability", async () => {
  vi.mocked(listPublishedPosts).mockResolvedValue({ posts: [], page: 1, hasMore: false });
  await expect(getHomeNews()).resolves.toEqual({ status: "empty" });
  expect(listPublishedPosts).toHaveBeenCalledWith({ limit: 3 });
});
it("does not disguise a failed read as no publications or log private causes", async () => {
  vi.mocked(listPublishedPosts).mockRejectedValue(new Error("private params"));
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(getHomeNews()).resolves.toEqual({ status: "error" });
  expect(logger).toHaveBeenCalledExactlyOnceWith("content: home news unavailable");
});
