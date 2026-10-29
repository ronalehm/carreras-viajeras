import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../actions/leads.actions", () => ({ retryLeadEmailAction: vi.fn() }));
import { retryLeadEmailAction } from "../actions/leads.actions";
import type { LeadEmail } from "../types/leads.types";
import { LeadMessages } from "./LeadMessages";
const message: LeadEmail = {
  id: "email-1",
  stage: "quoted",
  status: "unknown",
  recipient: "ana@example.test",
  sender: "sender@example.test",
  subject: "Tu viaje",
  body: "Hola Ana",
  templateVersion: 1,
  attempts: 1,
  executionId: "run-1",
  createdAt: new Date("2026-10-29T12:00:00Z"),
  updatedAt: new Date("2026-10-29T12:01:00Z"),
  sentAt: null,
  lastErrorCode: "smtp_unknown",
  canRetry: false,
  currentEpisode: true,
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("LeadMessages", () => {
  it("distinguishes acceptance from delivery and never retries unknown outcomes", () => {
    render(
      <LeadMessages data={{ automation: "enabled", messages: [message] }} />,
    );
    expect(screen.getByText("Por confirmar")).toBeTruthy();
    expect(
      screen.getByText(/esta conexión no confirma la entrega/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Reintentar correo" }),
    ).toBeNull();
    expect(screen.getByText("Ejecución de n8n: run-1")).toBeTruthy();
  });
  it("preserves original stage/content and reports successful retry accessibly", async () => {
    vi.mocked(retryLeadEmailAction).mockResolvedValue({
      status: "success",
      message: "Reintento programado.",
    });
    const { rerender } = render(
      <LeadMessages
        data={{
          automation: "enabled",
          messages: [
            {
              ...message,
              status: "failed",
              lastErrorCode: "pre_send_failed",
              canRetry: true,
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Correo · Cotizado" }),
    ).toBeTruthy();
    expect(screen.getByText("Hola Ana")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar correo" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Reintento programado.",
      ),
    );
    const data = vi.mocked(retryLeadEmailAction).mock.calls[0][1];
    expect(data.get("messageId")).toBe("email-1");
    expect(data.get("recipient")).toBeNull();
    rerender(
      <LeadMessages
        data={{
          automation: "enabled",
          messages: [
            {
              ...message,
              status: "pending",
              lastErrorCode: null,
              canRetry: false,
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "Reintento programado.",
    );
    expect(
      screen.queryByRole("button", { name: "Reintentar correo" }),
    ).toBeNull();
  });
  it("reports disabled automation and a real empty history", () => {
    render(<LeadMessages data={{ automation: "disabled", messages: [] }} />);
    expect(
      screen.getByText(/Los correos automáticos están desactivados/),
    ).toBeTruthy();
    expect(screen.getByText(/No hay correos registrados/)).toBeTruthy();
  });
});
