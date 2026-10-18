import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
} from "./auth.schema";

describe("signInSchema", () => {
  it("trims the email and lowercases it", () => {
    const result = signInSchema.safeParse({
      email: "  Admin@Example.COM  ",
      password: "secret",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ email: "admin@example.com", password: "secret" });
  });

  it("rejects an invalid email", () => {
    const result = signInSchema.safeParse({ email: "not-an-email", password: "secret" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["email"]]);
  });

  it("rejects an empty email", () => {
    const result = signInSchema.safeParse({ email: "   ", password: "secret" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["email"]]);
  });

  it("rejects an empty password", () => {
    const result = signInSchema.safeParse({ email: "admin@example.com", password: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["password"]]);
  });

  it("does not trim or otherwise alter the password", () => {
    const result = signInSchema.safeParse({ email: "admin@example.com", password: " pass " });

    expect(result.data?.password).toBe(" pass ");
  });
});

describe("signInSchema messages", () => {
  it("declares Spanish messages for each field", () => {
    const result = signInSchema.safeParse({ email: "x", password: "" });

    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      email: ["Introduce un correo válido."],
      password: ["Introduce tu contraseña."],
    });
  });
});

describe("signUpSchema", () => {
  const valid = {
    name: "  Ana Pérez ",
    email: " Ana@Example.com ",
    password: "12345678",
    confirmPassword: "12345678",
  };

  it("accepts valid data, trimming the name and normalizing the email", () => {
    const result = signUpSchema.safeParse(valid);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "Ana Pérez",
      email: "ana@example.com",
      password: "12345678",
      confirmPassword: "12345678",
    });
  });

  it("requires a name", () => {
    const result = signUpSchema.safeParse({ ...valid, name: "   " });

    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      name: ["Introduce tu nombre."],
    });
  });

  it("rejects names longer than 100 characters", () => {
    const result = signUpSchema.safeParse({ ...valid, name: "a".repeat(101) });

    expect(z.flattenError(result.error!).fieldErrors.name).toEqual([
      "El nombre no puede tener más de 100 caracteres.",
    ]);
  });

  it("rejects passwords shorter than 8 characters", () => {
    const result = signUpSchema.safeParse({
      ...valid,
      password: "1234567",
      confirmPassword: "1234567",
    });

    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      password: ["La contraseña debe tener al menos 8 caracteres."],
    });
  });

  it("accepts passwords of exactly 8 and 128 characters", () => {
    for (const password of ["a".repeat(8), "a".repeat(128)]) {
      const result = signUpSchema.safeParse({ ...valid, password, confirmPassword: password });
      expect(result.success).toBe(true);
    }
  });

  it("rejects passwords longer than 128 characters", () => {
    const password = "a".repeat(129);
    const result = signUpSchema.safeParse({ ...valid, password, confirmPassword: password });

    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      password: ["La contraseña no puede tener más de 128 caracteres."],
    });
  });

  it("puts the mismatch error on confirmPassword", () => {
    const result = signUpSchema.safeParse({ ...valid, confirmPassword: "87654321" });

    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      confirmPassword: ["Las contraseñas no coinciden."],
    });
  });

  it("rejects an invalid email", () => {
    const result = signUpSchema.safeParse({ ...valid, email: "ana" });

    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      email: ["Introduce un correo válido."],
    });
  });
});

describe("verifyEmailSchema", () => {
  it("accepts 6 digits, trimming spaces", () => {
    const result = verifyEmailSchema.safeParse({ otp: " 123456 " });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ otp: "123456" });
  });

  it.each(["12345", "1234567", "12a456", "", "12 3456"])("rejects %j", (otp) => {
    const result = verifyEmailSchema.safeParse({ otp });

    expect(result.success).toBe(false);
    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      otp: ["Introduce el código de 6 dígitos."],
    });
  });
});

describe("forgotPasswordSchema", () => {
  it("trims the email and lowercases it", () => {
    const result = forgotPasswordSchema.safeParse({ email: "  Ana@Example.COM " });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ email: "ana@example.com" });
  });

  it.each(["", "   ", "ana", "ana@"])("rejects %j", (email) => {
    const result = forgotPasswordSchema.safeParse({ email });

    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      email: ["Introduce un correo válido."],
    });
  });
});

describe("resetPasswordSchema", () => {
  const valid = { otp: " 123456 ", password: "12345678", confirmPassword: "12345678" };

  it("accepts valid data, trimming the code and keeping the password as typed", () => {
    const result = resetPasswordSchema.safeParse({
      ...valid,
      password: " 12345678 ",
      confirmPassword: " 12345678 ",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      otp: "123456",
      password: " 12345678 ",
      confirmPassword: " 12345678 ",
    });
  });

  it.each(["12345", "1234567", "12a456", ""])("rejects the code %j", (otp) => {
    const result = resetPasswordSchema.safeParse({ ...valid, otp });

    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      otp: ["Introduce el código de 6 dígitos."],
    });
  });

  it("rejects passwords shorter than 8 characters", () => {
    const result = resetPasswordSchema.safeParse({
      ...valid,
      password: "1234567",
      confirmPassword: "1234567",
    });

    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      password: ["La contraseña debe tener al menos 8 caracteres."],
    });
  });

  it("accepts passwords of exactly 8 and 128 characters", () => {
    for (const password of ["a".repeat(8), "a".repeat(128)]) {
      const result = resetPasswordSchema.safeParse({ ...valid, password, confirmPassword: password });
      expect(result.success).toBe(true);
    }
  });

  it("rejects passwords longer than 128 characters", () => {
    const password = "a".repeat(129);
    const result = resetPasswordSchema.safeParse({ ...valid, password, confirmPassword: password });

    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      password: ["La contraseña no puede tener más de 128 caracteres."],
    });
  });

  it("puts the mismatch error on confirmPassword", () => {
    const result = resetPasswordSchema.safeParse({ ...valid, confirmPassword: "87654321" });

    expect(z.flattenError(result.error!).fieldErrors).toEqual({
      confirmPassword: ["Las contraseñas no coinciden."],
    });
  });
});
