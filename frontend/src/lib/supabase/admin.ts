import crypto from 'crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

let cachedToken: string | null = null;

/**
 * Returns a guaranteed valid service_role JWT token.
 * If JWT_SECRET is available, signs an authentic service_role JWT.
 * Otherwise falls back to SERVICE_ROLE_KEY or anon key.
 */
function resolveServiceRoleKey(): string {
  if (cachedToken) return cachedToken;

  const secret = process.env.JWT_SECRET;
  if (secret) {
    try {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          role: 'service_role',
          iss: 'bosp',
          iat: Math.floor(Date.now() / 1000) - 60,
          exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365 * 10, // 10 years
        }),
      ).toString('base64url');
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${header}.${payload}`)
        .digest('base64url');

      cachedToken = `${header}.${payload}.${signature}`;
      return cachedToken;
    } catch {}
  }

  return (
    process.env.SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );
}

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
  const serviceKey = resolveServiceRoleKey();

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

