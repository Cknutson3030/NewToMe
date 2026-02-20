import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * supabaseAdmin:
 * - Uses SERVICE_ROLE key (server only)
 * - Bypasses RLS (so be careful)
 * - Use for: storage uploads, privileged operations, admin tasks
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/**
 * supabaseAnon:
 * - Uses ANON key (subject to RLS)
 * - Use for: public reads where RLS should apply
 */
export const supabaseAnon: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export const createRlsClient = (accessToken: string): SupabaseClient =>
  createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
