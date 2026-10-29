import { api } from "@/lib/api";
import { homeNewsResponseSchema } from "../schemas/content.schema";
import type { PublicPost } from "../types/content.types";

export async function fetchHomeNews(): Promise<PublicPost[]> {
  const { data } = await api.get("/noticias/portada");
  return homeNewsResponseSchema.parse(data).posts;
}
