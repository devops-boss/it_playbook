import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { AUTH_COOKIE_NAME } from './client';

/**
 * Server-side Supabase client for React Server Components and Route Handlers.
 *
 * Uses the anon key with the user's session cookie, so RLS applies exactly
 * as it does in the browser. The service-role key is never used here.
 */
export function createClient() {
  const cookieStore = cookies();
  const url =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'http://kong:8000';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return createServerClient(url, anonKey, {
    cookieOptions: {
      name: AUTH_COOKIE_NAME,
      path: '/',
      sameSite: 'lax',
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component, which cannot set cookies.
          // Middleware refreshes the session instead.
        }
      },
    },
  });
}
