import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { fetchCatalogTrips, registration, search } = vi.hoisted(() => ({
  fetchCatalogTrips: vi.fn(),
  registration: { open: true },
  search: { params: new URLSearchParams() },
}));
vi.mock("../services/catalogTrips.api", () => ({ fetchCatalogTrips }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search.params }));
vi.mock("@/lib/registrationConsent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/registrationConsent")>()),
  isRegistrationOpen: () => registration.open,
}));

import { useCatalogTripOptions } from "../hooks/useCatalogTripOptions";
import { ContactPageContent } from "./ContactPageContent";

const santiago = { slug: "maraton-santiago-2027", title: "Maratón de Santiago" };
const action = vi.fn();

// Shows the query status of the same hook, so a test can wait until the page has seen it.
function StatusProbe() {
  return <span data-testid="trips-status">{useCatalogTripOptions().status}</span>;
}

function renderContent(query = "") {
  search.params = new URLSearchParams(query);
  // Test client: no delay between the single retry and the error state.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ContactPageContent action={action} />
      <StatusProbe />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

function options() {
  const select = screen.getByLabelText("Carrera");
  if (!(select instanceof HTMLSelectElement)) throw new Error("Carrera is not a select");
  return { select, values: Array.from(select.options, (option) => option.value) };
}

function hiddenValue(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value;
}

beforeEach(() => {
  fetchCatalogTrips.mockReset();
  registration.open = true;
});
afterEach(cleanup);

it("shows a brief accessible loading state without the form while the trips are pending", () => {
  fetchCatalogTrips.mockReturnValue(new Promise(() => {}));
  const { container } = renderContent();

  expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
  expect(screen.getByText("Cargando el formulario de contacto…")).toBeTruthy();
  expect(container.querySelector("form")).toBeNull();
  expect(screen.queryByLabelText("Carrera")).toBeNull();
});

it("lists the published trips before the destinations without catalog", async () => {
  fetchCatalogTrips.mockResolvedValue([santiago]);
  renderContent();

  await screen.findByLabelText("Carrera");
  expect(options().values).toEqual(["", "maraton-santiago-2027", "rio", "roma"]);
  expect(screen.queryByText("Cargando el formulario de contacto…")).toBeNull();
});

it("preselects ?destino= and keeps the first value of each attribution parameter", async () => {
  fetchCatalogTrips.mockResolvedValue([santiago]);
  const { container } = renderContent("destino=rio&utm_source=x&utm_source=y&ref=amigo&other=1");

  await screen.findByLabelText("Carrera");
  expect(options().select.value).toBe("rio");
  expect(hiddenValue(container, "utm_source")).toBe("x");
  expect(hiddenValue(container, "ref")).toBe("amigo");
  expect(hiddenValue(container, "other")).toBeUndefined();
});

it("resolves an old ?destino= alias to its catalog trip", async () => {
  fetchCatalogTrips.mockResolvedValue([santiago]);
  renderContent("destino=santiago-2027");

  await screen.findByLabelText("Carrera");
  expect(options().select.value).toBe("maraton-santiago-2027");
});

it("keeps the form with the destinations without catalog after at most one retry", async () => {
  fetchCatalogTrips.mockRejectedValue(new Error("Request failed with status code 503"));
  renderContent("destino=maraton-santiago-2027");

  await screen.findByLabelText("Carrera");
  expect(fetchCatalogTrips).toHaveBeenCalledTimes(2);
  expect(options().values).toEqual(["", "rio", "roma"]);
  // A trip that did not arrive is not preselected.
  expect(options().select.value).toBe("");
});

it("keeps the loaded trips and what was typed when a later refetch fails", async () => {
  fetchCatalogTrips.mockResolvedValueOnce([santiago]);
  const { client } = renderContent("destino=maraton-santiago-2027");

  await screen.findByLabelText("Carrera");
  const name = screen.getByLabelText("Nombre y apellido");
  fireEvent.change(name, { target: { value: "Ana Pérez" } });

  fetchCatalogTrips.mockRejectedValue(new Error("Request failed with status code 503"));
  await act(() => client.refetchQueries());
  // The refetch (with its single retry) failed and the tree has re-rendered with that status.
  await waitFor(() => expect(screen.getByTestId("trips-status").textContent).toBe("error"));
  expect(fetchCatalogTrips).toHaveBeenCalledTimes(3);
  expect(options().values).toEqual(["", "maraton-santiago-2027", "rio", "roma"]);
  expect(options().select.value).toBe("maraton-santiago-2027");
  // Same input node with its value: the form was not remounted.
  expect(screen.getByLabelText("Nombre y apellido")).toBe(name);
  expect((name as HTMLInputElement).value).toBe("Ana Pérez");
});

it("keeps the closed-registration notice instead of the form", async () => {
  registration.open = false;
  fetchCatalogTrips.mockResolvedValue([santiago]);
  renderContent();

  expect(await screen.findByText(/El registro en línea abrirá pronto/)).toBeTruthy();
  await waitFor(() => expect(screen.queryByText("Cargando el formulario de contacto…")).toBeNull());
  expect(screen.queryByLabelText("Carrera")).toBeNull();
});
