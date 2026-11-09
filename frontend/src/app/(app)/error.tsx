'use client';

import * as React from 'react';
import Link from 'next/link';
import { IconAlertTriangle, IconHome, IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import type { UpstreamFailure } from '@/lib/api-error';

/**
 * The error page for the signed-in area.
 *
 * Next.js hands over the error and a `reset` function. The message is
 * deliberately not shown: in a production build it is replaced with a
 * generic one anyway, and anything that does come through is an internal
 * detail that means nothing to the person reading it. What the person is
 * given instead is the one thing they can act on - try again, or tell the
 * administrator that the server is not answering.
 */

const MESSAGES: Record<UpstreamFailure, { title: string; body: string }> = {
  'rate-limited': {
    title: 'The system is busy',
    body:
      'Too many requests arrived at once and the server asked this one to wait. ' +
      'Nothing is lost. Try again in a moment.',
  },
  unreachable: {
    title: 'The server did not answer',
    body:
      'The application could not reach the database. This is not something you ' +
      'can fix, and nothing you were typing has been lost. Tell the administrator ' +
      'that the application server is not responding.',
  },
  unknown: {
    title: 'This page could not be loaded',
    body:
      'Something went wrong while the page was being put together. Trying again ' +
      'usually works. If it does not, tell the administrator what you were doing.',
  },
};

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const failure = (error?.digest as UpstreamFailure) ?? 'unknown';
  const message = MESSAGES[failure] ?? MESSAGES.unknown;

  React.useEffect(() => {
    // The details go to the browser console, where the administrator can
    // find them, and nowhere else.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <IconAlertTriangle className="h-5 w-5" />
        </span>

        <h1 className="text-base font-semibold tracking-tight">{message.title}</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {message.body}
        </p>

        {error?.digest && failure !== 'unknown' && (
          <p className="mt-3 font-mono text-2xs text-muted-foreground/70">
            {error.digest}
          </p>
        )}

        <div className="mt-6 flex items-center justify-center gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => reset()}>
            <IconRefresh className="h-3.5 w-3.5" />
            Try again
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <Link href="/">
              <IconHome className="h-3.5 w-3.5" />
              Back to the home page
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
