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

  it("builds team_alert with one field per line and the current owner's address", () => {
    expect(
      lifecycleEmailTemplate("team_alert", {
        ...client,
        sourceLabel: "WhatsApp",
        ownerEmail: "comercial@example.test",
        leadUrl,
      }),
    ).toEqual({
      subject: "Nuevo registro: Ana · Maratón de Lima",
      body: [
        "Entró un registro nuevo al embudo.",
        "Nombre: Ana   María Pérez",
        "Carrera: Maratón de Lima",
        "Vía de entrada: WhatsApp",
        "Responsable: comercial@example.test",
        `Ficha: ${leadUrl}`,
      ].join("\n") + SIGNATURE,
      templateVersion: 1,
    });
  });

  it.each([null, "", "   "])("shows «sin asignar» in team_alert without an owner (%j)", (ownerEmail) => {
    const { body } = lifecycleEmailTemplate("team_alert", {
      ...client,
      sourceLabel: "Formulario web",
      ownerEmail,
      leadUrl,
    });
    expect(body.split("\n")).toContain("Responsable: sin asignar");
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

    const alert = lifecycleEmailTemplate("team_alert", {
      fullName: longName,
      race: longRace,
      sourceLabel: "Cuenta web",
      ownerEmail: null,
      leadUrl,
    });
    expect(Array.from(alert.subject)).toHaveLength(200);
    expect(alert.subject.startsWith(`Nuevo registro: ${"Á".repeat(120)} · Ultra`)).toBe(true);
  });

  it("normalizes every subject to a single line before the 200-character limit", () => {
    const race = raceLabel({ destinationText: " Maratón\r\nde\t  Lima \n" });
    const data = { fullName: "Ana", race, sourceLabel: "Formulario web", ownerEmail: null, stageLabel: "Nuevo", leadUrl };
    const kinds = [
      "welcome_registration",
      "welcome_contact",
      "welcome_account",
      "follow_up",
      "booking_confirmed",
      "team_alert",
      "owner_alert",
    ] as const;

    for (const kind of kinds) {
      const { subject } = lifecycleEmailTemplate(kind, data);
      expect(subject).not.toMatch(/[\r\n\t]|\s{2}/);
      expect(subject).toBe(subject.trim());
    }
    expect(lifecycleEmailTemplate("welcome_registration", data).subject).toBe(
      "Recibimos tu registro para Maratón de Lima",
    );
    expect(lifecycleEmailTemplate("team_alert", data).subject).toBe("Nuevo registro: Ana · Maratón de Lima");

    // Collapsing happens first, so a long race made of line breaks is not cut early.
    const spaced = `${"Lima\n\n\n".repeat(60)}`.trim();
    const subject = lifecycleEmailTemplate("follow_up", { fullName: "Ana", race: spaced }).subject;
    expect(Array.from(subject)).toHaveLength(200);
    expect(subject.startsWith("¿Seguimos con tu viaje a Lima Lima Lima")).toBe(true);
  });

  it("does not truncate a subject within the limit", () => {
    const race = "R".repeat(200 - "Recibimos tu registro para ".length);
    expect(lifecycleEmailTemplate("welcome_registration", { fullName: "Ana", race }).subject).toBe(
      `Recibimos tu registro para ${race}`,
    );
  });

  it("requires the fields of each kind at type level (checked by tsc)", () => {
    // @ts-expect-error team_alert needs sourceLabel, ownerEmail and leadUrl.
    lifecycleEmailTemplate("team_alert", client);
    // @ts-expect-error team_alert needs ownerEmail (null when the lead has no owner).
    lifecycleEmailTemplate("team_alert", { ...client, sourceLabel: "Formulario web", leadUrl });
    // @ts-expect-error owner_alert needs stageLabel, not sourceLabel.
    lifecycleEmailTemplate("owner_alert", { ...client, sourceLabel: "Formulario web", leadUrl });
    // @ts-expect-error internal alert data has no phone field.
    lifecycleEmailTemplate("team_alert", { ...client, sourceLabel: "Formulario web", ownerEmail: null, leadUrl, phone: "+51 987 654 321" });
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
      ownerEmail: "comercial@example.test",
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

describe("lifecycleEmailTemplate with a welcome code", () => {
  const welcomeCode = {
    code: "CV-7KQ2MZ",
    amountUsd: 50,
    expiresOn: "2027-03-15",
    accountUrl: "https://carrerasviajeras.example/cuenta",
  };
  const block = [
    "Crea tu cuenta y llévate US$50 de descuento",
    "Con tu cuenta de Carreras Viajeras tienes:",
    "- Mis carreras: tus reservas, pagos y saldo en un solo lugar.",
    "- Recompensas: acumula estrellas por tus viajes y referidos, y canjéalas por descuentos y beneficios.",
    "- Novedades primero: entérate antes que nadie de nuevas carreras y preventas.",
    "",
    "Tu código de bienvenida es CV-7KQ2MZ: US$50 de descuento en tu primera reserva. Para usarlo, crea tu cuenta con este mismo correo en https://carrerasviajeras.example/cuenta y compártelo con nuestro equipo al reservar. Válido hasta el 15 de marzo de 2027.",
  ].join("\n");

  it("adds the account block before the signature of welcome_registration, with templateVersion 2", () => {
    expect(lifecycleEmailTemplate("welcome_registration", { ...client, welcomeCode })).toEqual({
      subject: "Recibimos tu registro para Maratón de Lima",
      body:
        "Hola Ana, te damos la bienvenida a Carreras Viajeras. Recibimos tu registro para Maratón de Lima. Pronto una persona de nuestro equipo te escribirá por WhatsApp para contarte cómo es el viaje y resolver tus dudas. Si quieres adelantarnos algo, responde este correo." +
        `\n\n${block}` +
        SIGNATURE,
      templateVersion: 2,
    });
  });

  it("adds the account block before the signature of welcome_contact, with templateVersion 2", () => {
    expect(lifecycleEmailTemplate("welcome_contact", { ...client, welcomeCode })).toEqual({
      subject: "Recibimos tu consulta",
      body:
        "Hola Ana, te damos la bienvenida a Carreras Viajeras y gracias por escribirnos. Recibimos tu consulta sobre Maratón de Lima. Pronto una persona de nuestro equipo te contactará por WhatsApp. Si quieres añadir algo, responde este correo." +
        `\n\n${block}` +
        SIGNATURE,
      templateVersion: 2,
    });
  });

  it("keeps the welcome unchanged (templateVersion 1) when welcomeCode is absent or undefined", () => {
    for (const kind of ["welcome_registration", "welcome_contact"] as const) {
      const plain = lifecycleEmailTemplate(kind, client);
      expect(lifecycleEmailTemplate(kind, { ...client, welcomeCode: undefined })).toEqual(plain);
      expect(plain.templateVersion).toBe(1);
      expect(plain.body).not.toContain("Crea tu cuenta");
      expect(plain.body).not.toContain("CV-");
    }
  });

  it("shows the code exactly once and the amount in the heading and in the code sentence", () => {
    for (const kind of ["welcome_registration", "welcome_contact"] as const) {
      const { body } = lifecycleEmailTemplate(kind, { ...client, welcomeCode });
      expect(body.split("CV-7KQ2MZ")).toHaveLength(2);
      expect(body.split("US$50 de descuento")).toHaveLength(3);
      expect(body).not.toContain("**");
    }
  });

  it.each([
    [50, "US$50"],
    [10000, "US$10,000"],
    [49.5, "US$49.50"],
    [12.25, "US$12.25"],
  ])("formats the amount %s as %s", (amountUsd, expected) => {
    const { body } = lifecycleEmailTemplate("welcome_contact", { ...client, welcomeCode: { ...welcomeCode, amountUsd } });
    expect(body).toContain(`Crea tu cuenta y llévate ${expected} de descuento\n`);
    expect(body).toContain(`es CV-7KQ2MZ: ${expected} de descuento en tu primera reserva.`);
  });

  it.each([
    ["2027-03-15", "15 de marzo de 2027"],
    ["2027-01-01", "1 de enero de 2027"],
    ["2026-12-31", "31 de diciembre de 2026"],
  ])("formats the expiry date %s as «%s» from the string, without time zones", (expiresOn, expected) => {
    const { body } = lifecycleEmailTemplate("welcome_registration", {
      ...client,
      welcomeCode: { ...welcomeCode, expiresOn },
    });
    expect(body).toContain(`Válido hasta el ${expected}.${SIGNATURE}`);
  });

  it("truncates only the free body, keeping the whole block and the signature within 4000 characters", () => {
    const longRace = "Ultra ".repeat(900).trim();
    for (const kind of ["welcome_registration", "welcome_contact"] as const) {
      const email = lifecycleEmailTemplate(kind, { fullName: "Ana", race: longRace, welcomeCode });
      expect(Array.from(email.body)).toHaveLength(4000);
      expect(email.body.endsWith(`…\n\n${block}${SIGNATURE}`)).toBe(true);
      expect(email.templateVersion).toBe(2);
    }
  });

  it("does not change welcome_account or the other kinds", () => {
    expect(lifecycleEmailTemplate("welcome_account", client).templateVersion).toBe(1);
    expect(lifecycleEmailTemplate("follow_up", client).templateVersion).toBe(1);
    expect(lifecycleEmailTemplate("booking_confirmed", client).templateVersion).toBe(1);
    // @ts-expect-error only the registration and contact welcomes accept a welcome code.
    lifecycleEmailTemplate("welcome_account", { ...client, welcomeCode });
    // @ts-expect-error only the registration and contact welcomes accept a welcome code.
    lifecycleEmailTemplate("follow_up", { ...client, welcomeCode });
  });
});
