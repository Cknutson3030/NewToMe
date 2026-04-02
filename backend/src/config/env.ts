import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  SUPABASE_STORAGE_BUCKET: z.string().default("listing-images"),
  PUBLIC_BASE_URL: z.string().url().optional(), // for building public urls if needed

  // AI provider keys — at least one needed for /ai/analyze-image (optional at startup)
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_API_KEY: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);