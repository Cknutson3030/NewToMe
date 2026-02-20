import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  SUPABASE_STORAGE_BUCKET: z.string().default("listing-images"),
  PUBLIC_BASE_URL: z.string().url().optional(), // for building public urls if needed
});

export const env = EnvSchema.parse(process.env);