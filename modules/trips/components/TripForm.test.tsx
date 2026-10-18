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
    priceUsd: 0, capacity: null, imageUrl: null, status: "published", createdAt: new Date(), updatedAt: new Date(),
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
