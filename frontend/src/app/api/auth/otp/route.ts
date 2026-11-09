import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import crypto from 'crypto';

import { verifyOtp } from '@/lib/otp-store';

function signJwt(payload: Record<string, any>, secret: string): string {
  const b64 = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const data = b64(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${data}`)
    .digest('base64url');
  return `${header}.${data}.${signature}`;
}

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
    const jwtSecret = process.env.JWT_SECRET;
    const internalPassword = process.env.DEMO_USER_PASSWORD || 'hbkPmen_KuZ~JjwV4ZqB';

    let resolvedUserId: string | null = null;
    const displayName = cleanEmail.split('@')[0].replace(/[._-]/g, ' ');

    // 1. Ensure user and profile exist in database via RPC
    try {
      const ensureRes = await fetch(`${kongUrl}/rest/v1/rpc/ensure_authenticated_user`, {
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
      if (ensureRes.ok) {
        const ensureData = await ensureRes.json();
        if (ensureData && ensureData.user_id) {
          resolvedUserId = ensureData.user_id;
        }
      }
    } catch {
      // ignore
    }

    // 2. Direct cryptographic JWT generation (bulletproof - no password mismatches)
    if (jwtSecret) {
      const userId =
        resolvedUserId ||
        crypto.createHash('sha256').update(cleanEmail).digest('hex').slice(0, 32);

      // Format as valid UUID if needed
      const formattedUuid =
        userId.length === 36
          ? userId
          : `${userId.slice(0, 8)}-${userId.slice(8, 12)}-4${userId.slice(13, 16)}-a${userId.slice(17, 20)}-${userId.slice(20, 32)}`;

      const now = Math.floor(Date.now() / 1000);
      const accessToken = signJwt(
        {
          aud: 'authenticated',
          exp: now + 60 * 60 * 24 * 7, // 7 days
          sub: formattedUuid,
          email: cleanEmail,
          phone: '',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: { display_name: displayName },
          role: 'authenticated',
          session_id: crypto.randomUUID(),
        },
        jwtSecret
      );

      const refreshToken = signJwt(
        {
          aud: 'authenticated',
          exp: now + 60 * 60 * 24 * 30, // 30 days
          sub: formattedUuid,
          role: 'authenticated',
        },
        jwtSecret
      );

      // Set cookies in Next.js cookie store
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
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      return NextResponse.json({
        success: true,
        session: {
          access_token: accessToken,
          refresh_token: refreshToken,
          user: {
            id: formattedUuid,
            email: cleanEmail,
            user_metadata: { display_name: displayName },
          },
        },
      });
    }

    // Fallback via GoTrue password grant
    const tokenRes = await fetch(`${kongUrl}/auth/v1/token?grant_type=password`, {
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

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      const errMsg =
        tokenData.error_description ||
        tokenData.msg ||
        `Account "${cleanEmail}" was not found in the Big Outsource directory.`;
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

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
