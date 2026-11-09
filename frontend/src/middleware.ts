import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Refresh the auth session on every request and gate protected routes.
 *
 * The service-role key is never used here. The anon key plus the user's
 * session cookie is all we need; RLS enforces data access.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'http://kong:8000';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without configuration there is nothing to refresh; let the request
  // through so the login page can show a helpful message.
  if (!anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      name: 'bos-auth-token',
      path: '/',
      sameSite: 'lax',
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    user = null;
  }

  const { pathname } = request.nextUrl;

  const isAuthApi = pathname.startsWith('/api/auth');
  const isAuthRoute =
    pathname === '/login' || pathname.startsWith('/auth/') || pathname === '/setup';

  if (isAuthApi) {
    return response;
  }

  if (!user && !isAuthRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirectTo', pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((c) => {
      redirectResponse.cookies.set(c.name, c.value);
    });
    return redirectResponse;
  }

  const forceLogout = request.nextUrl.searchParams.get('logout') === 'true';

  if (user && isAuthRoute && !forceLogout) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    const redirectResponse = NextResponse.redirect(homeUrl);
    response.cookies.getAll().forEach((c) => {
      redirectResponse.cookies.set(c.name, c.value);
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and image files.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf|ico)$).*)',
  ],
};
