import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client with service-role permissions.
 * Bypasses RLS to guarantee internal operations (e.g. view history, favorites, draft sync)
 * always succeed on behalf of authenticated server endpoints without RLS drops.
 */
export function createAdminClient() {
  const url =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'http://kong:8000';
  const serviceKey =
    process.env.SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

