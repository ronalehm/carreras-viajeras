import { describe, expect, it } from "vitest";
import type {
  LeadActivity,
  LeadDetail,
  LeadPipelineItem,
} from "../types/leads.types";
import {
  getJourneyStages,
  getLeadAlerts,
  getLeadNextStep,
} from "./leadGuidance";

const lead: LeadPipelineItem = {
  id: "1",
  fullName: "Ana",
  phone: "+51938127170",
  stage: "new",
  source: "other",
  channel: "unknown",
  trip: null,
  destinationText: null,
  owner: null,
  email: null,
  contactOptOutAt: null,
  lostReason: null,
  nextActionDate: null,
  nextActionNote: null,
};
describe("lead guidance", () => {
  it("prioritizes current email failures without assigning an earlier-stage email to the new stage", () => {
    const status = {
      id: "mail",
      stage: "new" as const,
      status: "unknown" as const,
      lastErrorCode: "smtp_unknown",
    };
    expect(
      getLeadAlerts({ ...lead, emailStatus: status }, "2026-10-29")[0].code,
    ).toBe("email_unknown");
    expect(
      getLeadAlerts(
        { ...lead, stage: "quoted", emailStatus: status },
        "2026-10-29",
      ).some((a) => a.code === "email_unknown"),
    ).toBe(false);
    expect(
      getLeadAlerts(
        { ...lead, contactOptOutAt: new Date(), emailStatus: status },
        "2026-10-29",
      ).map((a) => a.code),
    ).toEqual(["opted_out"]);
  });
  it("prioritizes overdue, missing owner, no next action and missing email", () => {
    expect(
      getLeadAlerts(
        { ...lead, nextActionDate: "2026-10-28" },
        "2026-10-29",
      ).map((a) => a.code),
    ).toEqual(["overdue", "unassigned", "no_email"]);
    expect(getLeadAlerts(lead, "2026-10-29").map((a) => a.code)).toEqual([
      "unassigned",
      "no_action",
      "no_email",
    ]);
  });
  it("distinguishes today from overdue and flags inactive owners", () => {
    const alerts = getLeadAlerts(
      {
        ...lead,
        owner: { userId: "staff", email: "staff@example.test", active: false },
        nextActionDate: "2026-10-29",
      },
      "2026-10-29",
    );
    expect(alerts.map((a) => a.code)).toEqual([
      "inactive_owner",
      "today",
      "no_email",
    ]);
  });
  it("never recommends contacting an opted-out or archived lead, including after reopening", () => {
    expect(
      getLeadAlerts(
        { ...lead, contactOptOutAt: new Date(), nextActionDate: "2020-01-01" },
        "2026-10-29",
      ).map((a) => a.code),
    ).toEqual(["opted_out"]);
    expect(
      getLeadAlerts({ ...lead, archivedAt: new Date() }, "2026-10-29").map(
        (a) => a.code,
      ),
    ).toEqual(["archived"]);
    expect(
      getLeadNextStep({
        ...lead,
        archivedAt: null,
        contactOptOutAt: new Date(),
      } as LeadDetail),
    ).toContain("No se programan nuevos mensajes");
  });
  it.each(["paid", "lost"] as const)(
    "does not invent follow-up reminders in closed stage %s",
    (stage) => {
      expect(
        getLeadAlerts(
          { ...lead, stage, email: "ana@example.test" },
          "2026-10-29",
        ),
      ).toEqual([]);
    },
  );
});

describe("journey evidence", () => {
  it("does not fabricate intermediate stages in a direct New → Reserved transition", () => {
    const result = getJourneyStages("reserved", [
      { stageFrom: "new", stageTo: "reserved" } as LeadActivity,
    ]);
    expect(result.find((item) => item.stage === "new")?.state).toBe("visited");
    expect(result.find((item) => item.stage === "contacted")?.state).toBe(
      "unknown",
    );
    expect(result.find((item) => item.stage === "quoted")?.state).toBe(
      "unknown",
    );
    expect(result.find((item) => item.stage === "reserved")?.state).toBe(
      "current",
    );
  });
  it("preserves reopens and unknown history without inferring an initial stage", () => {
    expect(
      getJourneyStages("quoted", []).filter((item) => item.state === "visited"),
    ).toEqual([]);
    const stages = getJourneyStages("new", [
      { stageFrom: "quoted", stageTo: "lost" },
      { stageFrom: "lost", stageTo: "new" },
    ] as LeadActivity[]);
    expect(stages.find((item) => item.stage === "lost")?.state).toBe("visited");
    expect(stages.find((item) => item.stage === "new")?.state).toBe("current");
  });
});
