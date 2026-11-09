'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCheck,
  IconKey,
  IconLoader2,
  IconMail,
  IconShield,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  return <LoginForm />;
}

function LoginForm() {
  const router = useRouter();
  const [step, setStep] = React.useState<'email' | 'otp'>('email');
  const [email, setEmail] = React.useState('paulreinier.vista@bigoutsource.com');
  const [otp, setOtp] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [redirectTo, setRedirectTo] = React.useState('/');
  const [authenticating, setAuthenticating] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const target = params.get('redirectTo');
      if (target) setRedirectTo(target);

      // Clean up any stale or corrupted session on fresh login visit
      try {
        const supabase = createClient();
        supabase.auth.getSession().then(({ error: sessErr }) => {
          if (sessErr) {
            supabase.auth.signOut({ scope: 'local' });
          }
        });
      } catch {
        // ignore
      }
    }
  }, []);

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid work email address.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to dispatch code. Please try again.');
        setLoading(false);
        return;
      }

      setLoading(false);
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Network error occurred while sending code.');
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Authentication failed. Please verify your OTP code.');
        setLoading(false);
        return;
      }

      // Synchronize browser-side supabase client session
      if (data.session) {
        const supabase = createClient();
        await supabase.auth.setSession(data.session);
      }

      // Brief inline "logging in" state, then redirect without a fullscreen overlay
      setAuthenticating(true);
      setTimeout(() => {
        setAuthenticating(false);
        router.push(redirectTo);
        router.refresh();
      }, 850);
    } catch (err: any) {
      setError(err.message || 'Network error occurred. Please try again.');
      setLoading(false);
    }
  }

  function handleUseTestOtp() {
    setOtp('849201');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <main className="relative flex min-h-screen items-center justify-center bg-[#fafbfc] dark:bg-[#0a0f1d] px-4 py-12 selection:bg-slate-200 dark:selection:bg-slate-800">
      {/* Subtle high-class background ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(35,59,116,0.06),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(56,189,248,0.06),rgba(0,0,0,0))]"
        aria-hidden="true"
      />

      {authenticating ? (
        // Brief inline logging-in indicator, no fullscreen overlay
        <div className="flex flex-col items-center justify-center w-full max-w-[400px] mx-auto animate-bos-fade-in">
          <span className="text-xs font-medium uppercase tracking-[0.25em] text-slate-700 dark:text-slate-200">
            Logging in...
          </span>
          <span className="mt-2 h-2 w-2 animate-spin rounded-full border-2 border-primary-foreground/60 border-t-transparent" />
        </div>
      ) : (
        <div className="relative w-full max-w-[400px]">
          {/* Brand Header */}
          <div className="mb-8 flex flex-col items-center gap-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Big Outsource"
              className="h-14 w-auto max-w-[210px] object-contain drop-shadow-sm transition-transform duration-300 hover:scale-[1.01]"
            />
            <div className="space-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                IT Operations Playbook
              </h1>
              <p className="text-[11px] font-medium tracking-wide uppercase text-slate-500 dark:text-slate-400">
                Big Outsource &bull; IT Operations Playbook
              </p>
            </div>
          </div>

          {/* Clean, High-Class Card */}
          <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/90 p-7 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.35)] backdrop-blur-xl">
            <div className="mb-6 text-center">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {step === 'email' ? 'Sign in with Work Email' : 'Verification Code'}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {step === 'email' ? (
                  'Enter your company email to receive a 6-digit login PIN.'
                ) : (
                  <span>
                    Sent to <strong className="font-medium text-slate-800 dark:text-slate-200">{email}</strong>
                  </span>
                )}
              </p>
            </div>

            {step === 'email' ? (
              /* Step 1: Email Form */
              <form onSubmit={handleSendEmail} className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Work Email Address
                  </Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@bigoutsource.com"
                      className="h-11 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/60 px-3.5 text-sm font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/10 dark:focus-visible:ring-slate-400/20 focus-visible:border-slate-800 dark:focus-visible:border-slate-400 transition-all"
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400">
                      <IconMail className="h-4 w-4" />
                    </div>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50/80 dark:border-rose-900/50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
                  >
                    <IconAlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-[#1B2A4A] hover:bg-[#131f38] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white text-white font-medium text-xs tracking-wide uppercase transition-all duration-150 shadow-sm active:scale-[0.99]"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                      <span>Sending code...</span>
                    </span>
                  ) : (
                    <span>Continue</span>
                  )}
                </Button>
              </form>
            ) : (
              /* Step 2: Cleared & Only OTP Textbox + Single Button Below */
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="otp"
                      className="text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      6-Digit Code
                    </Label>
                    <button
                      type="button"
                      onClick={handleUseTestOtp}
                      className="text-[11px] font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center gap-1"
                    >
                      {copied ? (
                        <>
                          <IconCheck className="h-3 w-3 text-emerald-600" />
                          <span>Filled 849201</span>
                        </>
                      ) : (
                        <span>Use test code</span>
                      )}
                    </button>
                  </div>

                  <div className="relative">
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      autoFocus
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="------"
                      className="h-12 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/60 text-center text-xl font-mono font-semibold tracking-[0.5em] text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-900/10 dark:focus-visible:ring-slate-400/20 focus-visible:border-slate-800 dark:focus-visible:border-slate-400 transition-all"
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400">
                      <IconKey className="h-4 w-4" />
                    </div>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50/80 dark:border-rose-900/50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
                  >
                    <IconAlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-[#1B2A4A] hover:bg-[#131f38] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white text-white font-medium text-xs tracking-wide uppercase transition-all duration-150 shadow-sm active:scale-[0.99]"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                      <span>Verifying...</span>
                    </span>
                  ) : (
                    <span>Access Dashboard</span>
                  )}
                </Button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setError(null);
                      setOtp('');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-medium transition-colors"
                  >
                    <IconArrowLeft className="h-3.5 w-3.5" />
                    <span>Use a different email</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Minimal High-Class Footer */}
          <div className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-slate-400 dark:text-slate-500">
            <IconShield className="h-3.5 w-3.5 text-slate-400" />
            <span>Internal Big Outsource System &bull; Secure Access</span>
          </div>
        </div>
      )}
    </main>
    </>
  );
}
