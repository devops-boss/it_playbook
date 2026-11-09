import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness probe for the container healthcheck and the reverse proxy.
 *
 * It does not touch the database on purpose: a database outage should not
 * make the frontend look dead, and the health endpoint must stay fast.
 */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'bos-playbook-frontend',
    timestamp: new Date().toISOString(),
  });
}
