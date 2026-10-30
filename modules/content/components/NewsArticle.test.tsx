import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
import { NewsArticle } from "./NewsArticle";
import { NewsSection } from "./NewsSection";
import type { PublicPost } from "../types/content.types";
const post: PublicPost = { slug: "nueva-carrera", category: "news", title: "Nueva carrera", summary: "Una noticia importante.", body: "<script>alert('never executed')</script>\n\nSegundo párrafo seguro.", imageUrl: null, imageAlt: null, publishedAt: new Date("2026-10-29T15:00:00Z") };
afterEach(cleanup);
it("renders script markup only as text and keeps paragraph boundaries", () => {
  const { container } = render(<NewsArticle post={post} />);
  expect(screen.getByRole("heading", { level: 1, name: "Nueva carrera" })).toBeTruthy();
  expect(screen.getByText("<script>alert('never executed')</script>")).toBeTruthy();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText("Segundo párrafo seguro.")).toBeTruthy();
});
it("shows different loading, empty and error states with no fabricated news", () => {
  const { rerender } = render(<NewsSection news={{ status: "loading" }} />);
  expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
  expect(screen.queryAllByRole("article")).toHaveLength(0);
  rerender(<NewsSection news={{ status: "empty" }} />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByText("Todavía no hay publicaciones.")).toBeTruthy();
  rerender(<NewsSection news={{ status: "error" }} />);
  expect(screen.queryByText("Todavía no hay publicaciones.")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("no están disponibles");
  expect(screen.queryAllByRole("article")).toHaveLength(0);
});
it("shows publication links and explicit image descriptions", () => {
  render(<NewsSection news={{ status: "ok", posts: [{ ...post, imageUrl: "https://example.com/race.webp", imageAlt: "Corredores en una carrera" }] }} />);
  expect(screen.getByRole("link", { name: "Leer: Nueva carrera" }).getAttribute("href")).toBe("/noticias/nueva-carrera#noticias");
  expect(screen.getByRole("img", { name: "Corredores en una carrera" })).toBeTruthy();
});
