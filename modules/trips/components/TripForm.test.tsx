import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../actions/trips.actions", () => ({ createTripAction: vi.fn(), updateTripAction: vi.fn() }));
import { createTripAction, updateTripAction } from "../actions/trips.actions";
import { TripForm } from "./TripForm";
import type { Trip } from "../types/trips.types";

afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

it("conserva lo escrito después de dos errores sucesivos y muestra errores accesibles", async () => {
  vi.mocked(createTripAction).mockResolvedValue({
    status: "error", code: "slug_taken", message: "Ese identificador ya está en uso.",
    fieldErrors: { slug: ["Ese identificador ya está en uso."] },
    values: { title: "Mi viaje", slug: "santiago", includes: "Hotel\nTraslado" },
  });
  render(<TripForm />);
  const title = screen.getByLabelText<HTMLInputElement>("Título *");
  const slug = screen.getByLabelText<HTMLInputElement>("Identificador *");
  const includes = screen.getByLabelText<HTMLTextAreaElement>("Qué incluye");
  fireEvent.change(title, { target: { value: "Mi viaje" } });
  fireEvent.change(slug, { target: { value: "santiago" } });
  fireEvent.change(includes, { target: { value: "Hotel\nTraslado" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear viaje" }));
  await waitFor(() => expect(slug.getAttribute("aria-invalid")).toBe("true"));
  expect(title.value).toBe("Mi viaje");
  expect(includes.value).toBe("Hotel\nTraslado");
  expect(slug.getAttribute("aria-describedby")).toContain("trip-slug-error");
  fireEvent.change(title, { target: { value: "Mi viaje revisado" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear viaje" }));
  await waitFor(() => expect(createTripAction).toHaveBeenCalledTimes(2));
  expect(title.value).toBe("Mi viaje revisado");
  expect(includes.value).toBe("Hotel\nTraslado");
  expect(vi.mocked(createTripAction).mock.calls[1][1].get("title")).toBe("Mi viaje revisado");
});

it("edita un publicado con identificador de solo lectura y envía su id", async () => {
  const trip: Trip = {
    id: "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91", title: "Santiago 2027", slug: "santiago-2027",
    city: "Santiago", country: "Chile", raceDate: "2027-04-25", startDate: null, endDate: null,
    distances: ["42K", "21K"], includes: ["Hotel", "Traslados"], summary: "Viaje a Santiago.",
    priceUsd: 0, capacity: null, imageUrl: null, officialUrl: null, installmentsPriceUsd: null, depositUsd: null,
    companionPriceUsd: null, paymentTerms: null, excludes: [], notes: null,
    status: "published", createdAt: new Date(), updatedAt: new Date(),
  };
  vi.mocked(updateTripAction).mockResolvedValue({ status: "error", code: "archived", message: "Archivado por otra persona." });
  render(<TripForm trip={trip} />);
  expect(screen.getByLabelText<HTMLInputElement>("Identificador *").readOnly).toBe(true);
  expect(screen.getByText("Solo se puede cambiar en borrador.")).toBeTruthy();
  expect(screen.getByLabelText<HTMLInputElement>("Distancias *").value).toBe("42K, 21K");
  expect(screen.getByLabelText<HTMLInputElement>("Precio desde (USD)").value).toBe("0");
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await screen.findByText("Archivado por otra persona.");
  expect(vi.mocked(updateTripAction).mock.calls[0][1].get("id")).toBe(trip.id);
  expect(vi.mocked(updateTripAction).mock.calls[0][1].get("slug")).toBe(trip.slug);
  expect(createTripAction).not.toHaveBeenCalled();
});

it("pinta los campos nuevos con los valores del viaje, excludes uno por línea", () => {
  const trip: Trip = {
    id: "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91", title: "Santiago 2027", slug: "santiago-2027",
    city: "Santiago", country: "Chile", raceDate: "2027-04-25", startDate: null, endDate: null,
    distances: ["42K"], includes: ["Hotel"], summary: "Viaje a Santiago.", priceUsd: 1499, capacity: null,
    imageUrl: null, officialUrl: "https://maratondesantiago.cl/", installmentsPriceUsd: 1799, depositUsd: 300,
    companionPriceUsd: 1300, paymentTerms: "Reserva con US$ 300.\nSaldo en cuotas.",
    excludes: ["Vuelos internos", "Gastos personales"], notes: "Horario por confirmar.",
    status: "draft", createdAt: new Date(), updatedAt: new Date(),
  };
  render(<TripForm trip={trip} />);
  const value = (label: string) => screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(label).value;
  expect(value("Web oficial de la carrera")).toBe("https://maratondesantiago.cl/");
  expect(value("Precio total en cuotas (USD)")).toBe("1799");
  expect(value("Reserva (USD)")).toBe("300");
  expect(value("Precio de acompañante (USD)")).toBe("1300");
  expect(value("Condiciones de pago")).toBe("Reserva con US$ 300.\nSaldo en cuotas.");
  expect(value("Qué no incluye")).toBe("Vuelos internos\nGastos personales");
  expect(value("Detalles por confirmar")).toBe("Horario por confirmar.");
  expect(screen.getByText("Lo que aún falta confirmar del viaje.")).toBeTruthy();
});

it("muestra el error de un campo nuevo y conserva lo escrito", async () => {
  vi.mocked(createTripAction).mockResolvedValue({
    status: "error", code: "invalid_input", message: "Revisa los campos marcados.",
    fieldErrors: { officialUrl: ["Indica una URL que empiece por https://."] },
    values: { officialUrl: "http://maratondesantiago.cl/", excludes: "Vuelos internos\nGastos personales" },
  });
  render(<TripForm />);
  const officialUrl = screen.getByLabelText<HTMLInputElement>("Web oficial de la carrera");
  const excludes = screen.getByLabelText<HTMLTextAreaElement>("Qué no incluye");
  fireEvent.change(officialUrl, { target: { value: "http://maratondesantiago.cl/" } });
  fireEvent.change(excludes, { target: { value: "Vuelos internos\nGastos personales" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear viaje" }));
  await waitFor(() => expect(officialUrl.getAttribute("aria-invalid")).toBe("true"));
  expect(officialUrl.getAttribute("aria-describedby")).toBe("trip-officialUrl-error");
  expect(screen.getByText("Indica una URL que empiece por https://.").id).toBe("trip-officialUrl-error");
  expect(officialUrl.value).toBe("http://maratondesantiago.cl/");
  expect(excludes.value).toBe("Vuelos internos\nGastos personales");
  expect(vi.mocked(createTripAction).mock.calls[0][1].get("officialUrl")).toBe("http://maratondesantiago.cl/");
});
