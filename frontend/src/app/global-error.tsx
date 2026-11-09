'use client';

import * as React from 'react';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';

/**
 * The last line of defence.
 *
 * This page takes over when the error happens in the root layout itself,
 * so it has to provide its own <html> and <body> - the layout that would
 * normally do it is the thing that failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
          color: '#0f172a',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ maxWidth: '28rem', padding: '2rem', textAlign: 'center' }}>
          <div
            style={{
              width: '2.75rem',
              height: '2.75rem',
              margin: '0 auto 1rem',
              borderRadius: '9999px',
              background: '#fee2e2',
              color: '#b91c1c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconAlertTriangle width={22} height={22} />
          </div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            The application could not start
          </h1>
          <p
            style={{
              fontSize: '0.8125rem',
              lineHeight: 1.6,
              color: '#64748b',
              marginTop: '0.5rem',
            }}
          >
            Something went wrong before the page could be drawn. Try again; if it
            keeps happening, tell the administrator that the application server
            needs looking at.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: '1.5rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              border: 0,
              borderRadius: '0.375rem',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '0.8125rem',
              fontWeight: 500,
              padding: '0.5rem 0.875rem',
              cursor: 'pointer',
            }}
          >
            <IconRefresh width={14} height={14} />
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
