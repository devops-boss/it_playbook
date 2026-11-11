import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

function getLoginRedirect(request: NextRequest): NextResponse {
  // Respect reverse proxy forwarded host (e.g., domain or Tailscale IP)
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';

  let location = '/login';
  if (forwardedHost && !forwardedHost.includes('0.0.0.0')) {
    location = `${forwardedProto}://${forwardedHost}/login`;
  }

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: location,
    },
  });
}

async function handleSignOut(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createClient();

  try {
    await supabase.auth.signOut();
  } catch {
    // Continue even if session is already expired
  }

  const response = getLoginRedirect(request);

  const allCookies = cookieStore.getAll();
  for (const c of allCookies) {
    if (c.name.startsWith('sb-') || c.name.includes('supabase') || c.name.includes('auth')) {
      cookieStore.delete(c.name);
      response.cookies.delete(c.name);
    }
  }

  return response;
}

export async function GET(request: NextRequest) {
  return handleSignOut(request);
}

export async function POST(request: NextRequest) {
  return handleSignOut(request);
}
