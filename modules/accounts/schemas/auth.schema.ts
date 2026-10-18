import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
