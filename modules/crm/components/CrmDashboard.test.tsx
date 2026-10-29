import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LeadReport, LeadReportFilters } from "../types/leads.types";
import { CrmDashboard } from "./CrmDashboard";

afterEach(cleanup);
const filters: LeadReportFilters = { cohort: "2026-10", onlyImported: false };
function report(total = 12): LeadReport {
  const counts = {
    total,
    stages: {
      new: total - 4,
      contacted: 0,
      quoted: 0,
      reserved: 4,
      paid: 0,
      lost: 0,
    },
    optedOut: 0,
    unassigned: 2,
  };
  return {
    cohort: "2026-10",
    rows: [{ channel: "web", ...counts }],
    totals: counts,
    cohorts: ["2026-10"],
    tripOptions: [],
  };
}
function metric(label: string) {
  return within(screen.getByRole("article", { name: label }));
}

describe("CRM dashboard", () => {
  it("uses the same report totals for its metrics and table", () => {
    render(<CrmDashboard report={report()} filters={filters} />);
    expect(metric("Total de leads").getByText("12")).toBeTruthy();
    expect(metric("Nuevos").getByText("8")).toBeTruthy();
    expect(metric("Reservados").getByText("4")).toBeTruthy();
    expect(metric("Sin responsable").getByText("2")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Nuevo lead" }).getAttribute("href"),
    ).toBe("/crm/leads/nuevo");
  });

  it("updates the totals when a different report is supplied", () => {
    const { rerender } = render(
      <CrmDashboard report={report()} filters={filters} />,
    );
    rerender(<CrmDashboard report={report(20)} filters={filters} />);
    expect(metric("Total de leads").getByText("20")).toBeTruthy();
    expect(metric("Nuevos").getByText("16")).toBeTruthy();
    expect(metric("Total de leads").queryByText("12")).toBeNull();
  });

  it("preserves an empty cohort with zero metrics and an explanatory state", () => {
    const empty = report();
    empty.rows = [];
    empty.totals = {
      total: 0,
      stages: {
        new: 0,
        contacted: 0,
        quoted: 0,
        reserved: 0,
        paid: 0,
        lost: 0,
      },
      optedOut: 0,
      unassigned: 0,
    };
    render(<CrmDashboard report={empty} filters={filters} />);
    for (const label of [
      "Total de leads",
      "Nuevos",
      "Reservados",
      "Sin responsable",
    ])
      expect(metric(label).getByText("0")).toBeTruthy();
    expect(screen.getByText("No hay leads en esta cohorte.")).toBeTruthy();
  });

  it("retains the report filter URL contract and selected trip/import scope", () => {
    const data = report();
    data.tripOptions = [
      { id: "trip-1", title: "Maratón de Santiago", status: "published" },
    ];
    render(
      <CrmDashboard
        report={data}
        filters={{ ...filters, tripId: "trip-1", onlyImported: true }}
      />,
    );
    expect(
      screen.getByLabelText("Cohorte (mes de alta)").getAttribute("name"),
    ).toBe("cohorte");
    expect(screen.getByLabelText("Viaje").getAttribute("name")).toBe("viaje");
    expect(screen.getByLabelText("Importados").getAttribute("name")).toBe(
      "importados",
    );
    expect(
      screen.getByText(/solo importados · Maratón de Santiago/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Filtrar" })
        .closest("form")
        ?.getAttribute("action"),
    ).toBe("/crm");
  });
});
