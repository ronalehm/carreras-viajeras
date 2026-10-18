import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Introduce un correo válido." }));

const newPasswordSchema = z
  .string()
  .min(8, { error: "La contraseña debe tener al menos 8 caracteres." })
  .max(128, { error: "La contraseña no puede tener más de 128 caracteres." });

const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, { error: "Introduce el código de 6 dígitos." });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Introduce tu contraseña." }),
});

export const signUpSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "Introduce tu nombre." })
      .max(100, { error: "El nombre no puede tener más de 100 caracteres." }),
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export const verifyEmailSchema = z.object({
  otp: otpSchema,
});
