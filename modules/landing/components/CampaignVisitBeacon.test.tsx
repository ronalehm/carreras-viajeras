import { StrictMode } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CampaignVisitBeacon } from "./CampaignVisitBeacon";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(result: Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(() => result);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderBeacon() {
  return render(
    <StrictMode>
      <CampaignVisitBeacon slug="maraton-santiago-2027" code="mml26" />
    </StrictMode>,
  );
}

it("envía una sola petición por montaje en Strict Mode, con keepalive y el cuerpo { slug, c }", async () => {
  const fetchMock = stubFetch(Promise.resolve(new Response(null, { status: 204 })));
  renderBeacon();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/campaign-visits", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: "maraton-santiago-2027", c: "mml26" }),
  });
});

it("no renderiza DOM", () => {
  stubFetch(Promise.resolve(new Response(null, { status: 204 })));
  const { container } = renderBeacon();
  expect(container.innerHTML).toBe("");
});

it("ignora un fetch rechazado sin lanzar ni renderizar nada", async () => {
  const fetchMock = stubFetch(Promise.reject(new TypeError("Failed to fetch")));
  const { container } = renderBeacon();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(container.innerHTML).toBe("");
});
