import { describe, expect, it } from "vitest";
import { firstName, lifecycleEmailTemplate, raceLabel } from "./lifecycleEmailTemplates";

const SIGNATURE = "\n\nEquipo de Carreras Viajeras";
const client = { fullName: "  Ana   María Pérez ", race: "Maratón de Lima" };
const leadUrl = "https://carrerasviajeras.example/crm/leads/7c1e9f3a-2b4d-4e6f-8a0b-1c2d3e4f5a6b";

describe("firstName", () => {
  it("uses the first word of the trimmed name, ignoring extra spaces", () => {
    expect(firstName("  Ana   María Pérez ")).toBe("Ana");
    expect(firstName("Luis")).toBe("Luis");
  });

  it("falls back to «viajero» for a blank name", () => {
    expect(firstName("   ")).toBe("viajero");
  });
});

describe("raceLabel", () => {
  it("prefers the trip title, then the destination, then a generic label", () => {
    expect(raceLabel({ tripTitle: " Maratón de Berlín ", destinationText: "Berlín" })).toBe("Maratón de Berlín");
    expect(raceLabel({ tripTitle: "   ", destinationText: " Cusco " })).toBe("Cusco");
    expect(raceLabel({ tripTitle: null, destinationText: "" })).toBe("tu próxima carrera");
    expect(raceLabel({})).toBe("tu próxima carrera");
  });
});

describe("lifecycleEmailTemplate", () => {
  it("builds welcome_registration", () => {
    expect(lifecycleEmailTemplate("welcome_registration", client)).toEqual({
      subject: "Recibimos tu registro para Maratón de Lima",
      body:
        "Hola Ana, te damos la bienvenida a Carreras Viajeras. Recibimos tu registro para Maratón de Lima. Pronto una persona de nuestro equipo te escribirá por WhatsApp para contarte cómo es el viaje y resolver tus dudas. Si quieres adelantarnos algo, responde este correo." +
        SIGNATURE,
      templateVersion: 1,
    });
  });

  it("builds welcome_contact", () => {
    expect(lifecycleEmailTemplate("welcome_contact", client)).toEqual({
      subject: "Recibimos tu consulta",
      body:
        "Hola Ana, te damos la bienvenida a Carreras Viajeras y gracias por escribirnos. Recibimos tu consulta sobre Maratón de Lima. Pronto una persona de nuestro equipo te contactará por WhatsApp. Si quieres añadir algo, responde este correo." +
        SIGNATURE,
      templateVersion: 1,
    });
  });

  it("builds welcome_account", () => {
    expect(lifecycleEmailTemplate("welcome_account", client)).toEqual({
      subject: "Te damos la bienvenida a Carreras Viajeras",
      body:
        "Hola Ana, tu cuenta y tu perfil de runner ya están listos. Desde tu cuenta podrás ver tus carreras y mantener tus datos al día. Una persona de nuestro equipo te escribirá para ayudarte a elegir tu próximo viaje. Si tienes una consulta, responde este correo." +
        SIGNATURE,
      templateVersion: 1,
    });
  });

  it("builds follow_up", () => {
    expect(lifecycleEmailTemplate("follow_up", client)).toEqual({
      subject: "¿Seguimos con tu viaje a Maratón de Lima?",
      body:
        "Hola Ana, queríamos saber cómo vas con tu decisión sobre Maratón de Lima. Si tienes dudas o necesitas más información, responde este correo y te ayudamos." +
        SIGNATURE,
      templateVersion: 1,
    });
  });

  it("builds booking_confirmed", () => {
    expect(lifecycleEmailTemplate("booking_confirmed", client)).toEqual({
      subject: "Tu separación para Maratón de Lima está confirmada",
      body:
        "Hola Ana, confirmamos tu separación para Maratón de Lima. Nuestro equipo te escribirá para coordinar los siguientes pasos. Si tienes una consulta, responde este correo." +
        SIGNATURE,
      templateVersion: 1,
    });
  });

  it("builds team_alert with one field per line", () => {
    expect(lifecycleEmailTemplate("team_alert", { ...client, sourceLabel: "Formulario web", leadUrl })).toEqual({
      subject: "Nuevo registro: Ana · Maratón de Lima",
      body: [
        "Entró un registro nuevo al embudo.",
        "Nombre: Ana   María Pérez",
        "Carrera: Maratón de Lima",
        "Vía de entrada: Formulario web",
        "Responsable: sin asignar",
        `Ficha: ${leadUrl}`,
      ].join("\n") + SIGNATURE,
      templateVersion: 1,
    });
  });

  it("builds owner_alert with one field per line", () => {
    expect(lifecycleEmailTemplate("owner_alert", { ...client, stageLabel: "Contactado", leadUrl })).toEqual({
      subject: "Te asignaron un lead: Ana",
      body: [
        "Te asignaron un lead en el CRM.",
        "Nombre: Ana   María Pérez",
        "Carrera: Maratón de Lima",
        "Etapa: Contactado",
        `Ficha: ${leadUrl}`,
      ].join("\n") + SIGNATURE,
      templateVersion: 1,
    });
  });

  it("uses the race fallback in the texts", () => {
    const race = raceLabel({ tripTitle: null, destinationText: null });
    const email = lifecycleEmailTemplate("follow_up", { fullName: "Luis", race });

    expect(email.subject).toBe("¿Seguimos con tu viaje a tu próxima carrera?");
    expect(email.body).toContain("tu decisión sobre tu próxima carrera.");
  });

  it("keeps the subject and body within the client_emails limits with very long data", () => {
    const longRace = "Ultra ".repeat(900).trim();
    const longName = `${"Á".repeat(120)} Pérez`;

    for (const kind of ["welcome_registration", "follow_up", "booking_confirmed"] as const) {
      const email = lifecycleEmailTemplate(kind, { fullName: longName, race: longRace });
      expect(Array.from(email.subject)).toHaveLength(200);
      expect(email.subject.endsWith("…")).toBe(true);
      expect(Array.from(email.body).length).toBeLessThanOrEqual(4000);
      expect(email.body.endsWith(SIGNATURE)).toBe(true);
    }

    const alert = lifecycleEmailTemplate("team_alert", { fullName: longName, race: longRace, sourceLabel: "Cuenta web", leadUrl });
    expect(Array.from(alert.subject)).toHaveLength(200);
    expect(alert.subject.startsWith(`Nuevo registro: ${"Á".repeat(120)} · Ultra`)).toBe(true);
  });

  it("does not truncate a subject within the limit", () => {
    const race = "R".repeat(200 - "Recibimos tu registro para ".length);
    expect(lifecycleEmailTemplate("welcome_registration", { fullName: "Ana", race }).subject).toBe(
      `Recibimos tu registro para ${race}`,
    );
  });

  it("requires the fields of each kind at type level (checked by tsc)", () => {
    // @ts-expect-error team_alert needs sourceLabel and leadUrl.
    lifecycleEmailTemplate("team_alert", client);
    // @ts-expect-error owner_alert needs stageLabel, not sourceLabel.
    lifecycleEmailTemplate("owner_alert", { ...client, sourceLabel: "Formulario web", leadUrl });
    // @ts-expect-error internal alert data has no phone field.
    lifecycleEmailTemplate("team_alert", { ...client, sourceLabel: "Formulario web", leadUrl, phone: "+51 987 654 321" });
  });

  it("never shows phone, documents or notes in internal alerts, even if the caller passes a full lead", () => {
    const lead = {
      fullName: "Ana Pérez",
      race: "Maratón de Lima",
      phone: "+51 987 654 321",
      documentNumber: "DNI 45678912",
      medicalNotes: "Asma controlada",
      internalNotes: "Pidió descuento",
      sourceLabel: "Formulario web",
      stageLabel: "Nuevo",
      leadUrl,
    };

    for (const email of [lifecycleEmailTemplate("team_alert", lead), lifecycleEmailTemplate("owner_alert", lead)]) {
      const text = `${email.subject}\n${email.body}`;
      expect(text).not.toContain("987");
      expect(text).not.toContain("45678912");
      expect(text).not.toContain("Asma");
      expect(text).not.toContain("descuento");
      expect(text).not.toMatch(/tel[eé]fono|documento|nota/i);
    }
  });
});
