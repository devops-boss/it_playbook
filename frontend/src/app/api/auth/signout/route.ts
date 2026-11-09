import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

async function handleSignOut(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createClient();

  try {
    await supabase.auth.signOut();
  } catch {
    // Continue even if session is already expired
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://playbook.test.local';
  const response = NextResponse.redirect(new URL('/login', baseUrl), {
    status: 302,
  });

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
