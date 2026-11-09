import { createBrowserClient } from '@supabase/ssr';

export const AUTH_COOKIE_NAME = 'bos-auth-token';

/**
 * Browser-side Supabase client.
 *
 * IMPORTANT: only the anon key is ever used in the browser. The service-role
 * key must never reach the client bundle -- all privileged operations go
 * through Postgres RPCs guarded by RLS and internal permission checks.
 */
export function createClient() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!configuredUrl || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy .env.example to .env and fill in the values.',
    );
  }

  // The API is served by the same nginx that serves the application, on
  // the same host, so in the browser the API is always on the address the
  // page was opened with. Using the configured URL instead would break
  // for anyone who reaches the app on another name - an IP address,
  // localhost, a second DNS name - because the request would leave the
  // origin the page came from, and the browser would refuse it before it
  // was ever sent. That showed up as "Failed to fetch" on the sign-in
  // form, with nothing in the server logs to explain it.
  const url =
    typeof window !== 'undefined' && window.location
      ? window.location.origin
      : configuredUrl;

  return createBrowserClient(url, anonKey, {
    cookieOptions: {
      name: AUTH_COOKIE_NAME,
      path: '/',
      sameSite: 'lax',
    },
  });
}
