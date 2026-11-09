import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

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

    // Authenticate through Supabase GoTrue on Kong
    const kongUrl = process.env.INTERNAL_API_URL || 'http://kong:8000';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const internalPassword = process.env.DEMO_USER_PASSWORD || 'hbkPmen_KuZ~JjwV4ZqB';

    // Auto-ensure user exists and has matching password in auth.users
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
      });
    } catch {
      // ignore if offline or unneeded
    }

    let tokenRes: Response;
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
      });
    } catch {
      // Fallback via public url if internal network name differs
      const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://playbook.test.local';
      tokenRes = await fetch(`${publicUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: internalPassword,
        }),
      });
    }

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      const errMsg =
        tokenData.error_description ||
        tokenData.msg ||
        `Account "${cleanEmail}" was not found in the Big Outsource directory.`;
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    // Create server client to set cookie in cookieStore
    const cookieStore = cookies();
    const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://playbook.test.local';

    const supabase = createServerClient(publicUrl, anonKey, {
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
      },
      user: {
        email: cleanEmail,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Authentication error occurred.' },
      { status: 500 }
    );
  }
}
