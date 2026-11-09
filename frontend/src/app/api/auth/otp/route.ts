import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { AUTH_COOKIE_NAME } from '@/lib/supabase/client';
import { verifyOtp } from '@/lib/otp-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email;
    const otp = body.otp;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = (otp || '').toString().trim();

    if (!cleanOtp) {
      return NextResponse.json({ error: 'Please enter the 6-digit OTP code.' }, { status: 400 });
    }

    if (!verifyOtp(cleanEmail, cleanOtp)) {
      return NextResponse.json(
        { error: 'Invalid or expired OTP code. Please check your email for the code.' },
        { status: 400 }
      );
    }

    const kongUrl = process.env.INTERNAL_API_URL || 'http://kong:8000';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const serviceRoleKey = process.env.SERVICE_ROLE_KEY || '';
    const internalPassword = process.env.DEMO_USER_PASSWORD || 'hbkPmen_KuZ~JjwV4ZqB';
    const displayName = cleanEmail.split('@')[0].replace(/[._-]/g, ' ');

    // 1. Try to ensure user exists via database RPC (with 3-second timeout so it never hangs)
    try {
      await fetch(`${kongUrl}/rest/v1/rpc/ensure_authenticated_user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
        body: JSON.stringify({
          p_email: cleanEmail,
          p_password: internalPassword,
        }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // RPC may not be present if migrations are pending; continue to GoTrue
    }

    // 2. Perform GoTrue password authentication via internal Kong (fast, local)
    let tokenRes: Response | null = null;
    let tokenData: any = null;

    try {
      tokenRes = await fetch(`${kongUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: internalPassword,
        }),
        signal: AbortSignal.timeout(4000),
      });
      tokenData = await tokenRes.json();
    } catch (e: any) {
      // ignore
    }

    // 3. If password grant was rejected and service_role_key is available, auto-create/sync user in GoTrue
    if ((!tokenRes || !tokenRes.ok) && serviceRoleKey) {
      try {
        await fetch(`${kongUrl}/auth/v1/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            email: cleanEmail,
            password: internalPassword,
            email_confirm: true,
            user_metadata: { display_name: displayName },
          }),
          signal: AbortSignal.timeout(4000),
        });

        // Retry password authentication
        tokenRes = await fetch(`${kongUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
          },
          body: JSON.stringify({
            email: cleanEmail,
            password: internalPassword,
          }),
          signal: AbortSignal.timeout(4000),
        });
        tokenData = await tokenRes.json();
      } catch {
        // ignore
      }
    }

    if (!tokenRes || !tokenRes.ok || !tokenData?.access_token) {
      const errMsg =
        tokenData?.error_description ||
        tokenData?.msg ||
        `Account "${cleanEmail}" could not be verified. Please make sure the admin account exists in the database.`;
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    // 4. Save session in HTTP cookies via Next.js SSR client using internal kongUrl
    const cookieStore = cookies();
    const supabase = createServerClient(kongUrl, anonKey, {
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
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    await supabase.auth.setSession({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    });

    return NextResponse.json({
      success: true,
      session: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        user: tokenData.user,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Authentication error occurred.' },
      { status: 500 }
    );
  }
}
