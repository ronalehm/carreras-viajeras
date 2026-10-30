import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BookingFilters } from "./BookingFilters";

afterEach(cleanup);

function kind(): HTMLSelectElement {
  const element = screen.getByLabelText("Tipo");
  if (!(element instanceof HTMLSelectElement)) throw new Error("Tipo is not a select");
  return element;
}

describe("BookingFilters", () => {
  it("offers Todas, Reales and Simuladas, with Todas selected by default", () => {
    render(<BookingFilters trips={[]} />);
    expect(Array.from(kind().options).map((option) => [option.value, option.text])).toEqual([
      ["", "Todas"],
      ["reales", "Reales"],
      ["simuladas", "Simuladas (demo)"],
    ]);
    expect(kind().value).toBe("");
  });

  it.each([
    [true, "simuladas"],
    [false, "reales"],
  ])("selects the kind of the current filter (simulated: %s)", (simulated, value) => {
    render(<BookingFilters trips={[]} simulated={simulated} />);
    expect(kind().value).toBe(value);
  });
});
