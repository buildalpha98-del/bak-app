import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for admin operations that bypass RLS.
 * Only used server-side for operations like creating auth users.
 */
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
