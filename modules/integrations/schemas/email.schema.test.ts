import { describe, expect, it } from "vitest";
import {
  clientEmailKindSchema,
  emailAckSchema,
  emailAttemptSchema,
  emailClaimSchema,
  emailFailSchema,
  emailOperationSchema,
  internalEmailKindSchema,
} from "./email.schema";
const token = "b0000000-0000-4000-8000-000000000001";
describe("email integration contracts", () => {
  it("bounds batches, requires execution trace and rejects arbitrary recipients/content", () => {
    expect(emailClaimSchema.parse({ executionId: "100" })).toEqual({
      executionId: "100",
      limit: 1,
    });
    for (const limit of [0, 11, "1", 1.5])
      expect(
        emailClaimSchema.safeParse({ executionId: "100", limit }).success,
      ).toBe(false);
    expect(
      emailClaimSchema.safeParse({
        executionId: "100",
        to: "injected@example.test",
      }).success,
    ).toBe(false);
    expect(
      emailAttemptSchema.safeParse({ attemptToken: token, body: "injected" })
        .success,
    ).toBe(false);
  });
  it("requires a valid attempt and conservatively classifies an unspecified failure", () => {
    expect(emailFailSchema.parse({ attemptToken: token }).kind).toBe(
      "smtp_unknown",
    );
    expect(
      emailAttemptSchema.safeParse({ attemptToken: "invalid" }).success,
    ).toBe(false);
    expect(emailOperationSchema.safeParse("send").success).toBe(false);
    expect(
      emailAckSchema.safeParse({
        attemptToken: token,
        smtpMessageId: "a\r\nHeader",
      }).success,
    ).toBe(false);
  });
  it("lists every email kind and marks only the team and owner alerts as internal", () => {
    expect(clientEmailKindSchema.options).toEqual([
      "stage",
      "welcome_registration",
      "welcome_contact",
      "welcome_account",
      "follow_up",
      "booking_confirmed",
      "team_alert",
      "owner_alert",
    ]);
    expect(internalEmailKindSchema.options).toEqual(["team_alert", "owner_alert"]);
    for (const kind of clientEmailKindSchema.options.filter(
      (kind) => kind !== "team_alert" && kind !== "owner_alert",
    ))
      expect(internalEmailKindSchema.safeParse(kind).success).toBe(false);
    expect(clientEmailKindSchema.safeParse("campaign").success).toBe(false);
  });
});
