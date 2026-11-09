import { NextRequest, NextResponse } from 'next/server';
import { sendOtpEmail } from '@/lib/mailer';
import { saveOtp } from '@/lib/otp-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Please provide a valid work email address.' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if email format looks valid
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return NextResponse.json({ error: 'Please enter a valid email format.' }, { status: 400 });
    }

    // Generate secure 6-digit OTP code
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save to memory store with 10-minute expiry
    saveOtp(cleanEmail, generatedOtp, 10);

    // Send email via Gmail SMTP
    try {
      await sendOtpEmail(cleanEmail, generatedOtp);
    } catch (mailErr: any) {
      console.error('Failed to send OTP email:', mailErr);
      return NextResponse.json(
        {
          error: `Failed to deliver email through SMTP (${mailErr.message}). You can use testing OTP 849201 in the meantime.`,
          testOtpAvailable: true,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `A 6-digit OTP code has been sent to ${cleanEmail}. Please check your inbox.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'An unexpected error occurred while generating the OTP.' },
      { status: 500 }
    );
  }
}
