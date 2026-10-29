import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
const { fetchHomeNews } = vi.hoisted(() => ({ fetchHomeNews: vi.fn() }));
vi.mock("../services/homeNews.api", () => ({ fetchHomeNews }));

import { HomeNewsSection } from "./HomeNewsSection";
import type { PublicPost } from "../types/content.types";

const post: PublicPost = {
  slug: "nueva-carrera", category: "news", title: "Nueva carrera", summary: "Una noticia importante.",
  body: "Cuerpo.", imageUrl: null, imageAlt: null, publishedAt: new Date("2026-10-29T15:00:00Z"),
};

function renderSection() {
  // Test client: no delay between the single retry and the error state.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(<QueryClientProvider client={client}><HomeNewsSection /></QueryClientProvider>);
}

beforeEach(() => {
  fetchHomeNews.mockReset();
});
afterEach(cleanup);

it("shows a loading state without fabricated cards while the request is pending", () => {
  fetchHomeNews.mockReturnValue(new Promise(() => {}));
  renderSection();

  expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
  expect(screen.getByText("Cargando noticias…")).toBeTruthy();
  expect(screen.queryAllByRole("article")).toHaveLength(0);
});

it("shows the cards returned by the endpoint", async () => {
  fetchHomeNews.mockResolvedValue([post]);
  renderSection();

  expect((await screen.findByRole("link", { name: "Leer: Nueva carrera" })).getAttribute("href")).toBe("/noticias/nueva-carrera");
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.queryByRole("status")).toBeNull();
});

it("shows the empty state when nothing is published", async () => {
  fetchHomeNews.mockResolvedValue([]);
  renderSection();

  expect(await screen.findByText("Todavía no hay publicaciones.")).toBeTruthy();
  expect(screen.queryAllByRole("article")).toHaveLength(0);
});

it("shows the fixed notice after at most one retry", async () => {
  fetchHomeNews.mockRejectedValue(new Error("Request failed with status code 503"));
  renderSection();

  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("no están disponibles"));
  expect(fetchHomeNews).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Todavía no hay publicaciones.")).toBeNull();
  expect(screen.queryAllByRole("article")).toHaveLength(0);
});
