import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  LeadPipelineData,
  LeadPipelineItem,
  LeadStage,
} from "../types/leads.types";
import { LeadPipeline } from "./LeadPipeline";
import { LeadJourney } from "./LeadJourney";
import type { LeadActivity, LeadDetail } from "../types/leads.types";
const stages: LeadStage[] = [
  "new",
  "contacted",
  "quoted",
  "reserved",
  "paid",
  "lost",
];
const lead: LeadPipelineItem = {
  id: "sample",
  fullName: "Camila",
  stage: "new",
  source: "other",
  channel: "unknown",
  phone: "+51938127170",
  trip: null,
  destinationText: "Santiago",
  owner: null,
  email: null,
  contactOptOutAt: null,
  lostReason: null,
  nextActionDate: null,
  nextActionNote: null,
};
const data: LeadPipelineData = {
  columns: stages.map((stage) => ({
    stage,
    total: stage === "new" ? 41 : 0,
    leads: stage === "new" ? [lead] : [],
  })),
  stageCounts: {
    new: 41,
    contacted: 0,
    quoted: 0,
    reserved: 0,
    paid: 0,
    lost: 0,
  },
  ownerOptions: [],
};
afterEach(cleanup);
describe("LeadPipeline", () => {
  it("shows full counts, bounded samples, a separate Lost exit and list links preserving filters", () => {
    render(
      <LeadPipeline
        data={data}
        filters={{ owner: "mine", page: 1 }}
        today="2026-10-29"
      />,
    );
    const region = screen.getByRole("region", { name: "Etapa Nuevo" });
    expect(within(region).getByText("Mostrando 1 de 41")).toBeTruthy();
    expect(
      within(region)
        .getByRole("link", { name: /Ver lista de Nuevo/ })
        .getAttribute("href"),
    ).toBe("/crm/leads?etapa=new&responsable=mios&vista=lista");
    expect(
      within(region)
        .getByRole("link", { name: /Camila/ })
        .getAttribute("href"),
    ).toBe("/crm/leads/sample");
    expect(
      screen.getByText("Salida posible desde cualquier etapa."),
    ).toBeTruthy();
    expect(
      screen.getAllByText(
        "Sin contactos en esta etapa con los filtros actuales.",
      ),
    ).toHaveLength(5);
  });
  it("focuses the selected stage without erasing complete funnel totals", () => {
    render(
      <LeadPipeline
        data={data}
        filters={{ stage: "quoted", page: 1 }}
        today="2026-10-29"
      />,
    );
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Etapa Cotizado" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nuevo 41" })).toBeTruthy();
  });
  it("shows recorded transitions, skipped stages and a blocked contact without contact guidance", () => {
    render(
      <LeadJourney
        lead={
          {
            ...lead,
            stage: "reserved",
            archivedAt: null,
            contactOptOutAt: new Date(),
          } as LeadDetail
        }
        activities={[
          {
            id: "event",
            stageFrom: "new",
            stageTo: "reserved",
            createdAt: new Date("2026-10-28T14:00:00Z"),
            actor: null,
            body: null,
          } as LeadActivity,
        ]}
        today="2026-10-29"
      />,
    );
    expect(screen.getByText("Cotizado · Sin registro")).toBeTruthy();
    expect(screen.getByText("Reservado · Actual")).toBeTruthy();
    expect(
      within(
        screen.getByRole("list", { name: "Etapas principales" }),
      ).queryByText(/Perdido/),
    ).toBeNull();
    expect(
      within(
        screen.getByRole("list", { name: "Salidas del embudo" }),
      ).getByText("Perdido · Sin registro"),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No contactar" })).toBeTruthy();
    expect(screen.queryByText("Sin próxima acción")).toBeNull();
  });
});
