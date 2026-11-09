/**
 * Turning an upstream failure into something a person can act on.
 *
 * The data layer talks to the API through Supabase, which reports a
 * failure as an object with a message rather than by throwing. The
 * server components then throw that object, and without any care the
 * person ends up looking at a stack trace.
 *
 * There are three failures worth telling apart, because the thing to do
 * about each is different:
 *
 *   * the gateway refused the request because too many were made - wait a
 *     moment and try again;
 *   * the API could not be reached at all - tell the administrator, the
 *     server is not answering;
 *   * anything else - the person should report it.
 *
 * Next.js keeps the `digest` property of a thrown error when it hands the
 * error to the error page, but replaces the message in a production
 * build so that nothing internal leaks out. The digest is therefore how
 * the message gets through.
 */

export type UpstreamFailure = 'rate-limited' | 'unreachable' | 'unknown';

export class UpstreamError extends Error {
  /** The name of the failure. Next.js carries this to the error page. */
  digest: UpstreamFailure;

  constructor(message: string, digest: UpstreamFailure) {
    super(message);
    this.name = 'UpstreamError';
    this.digest = digest;
  }
}

/**
 * Wrap a failure from the API in an error that says what went wrong.
 *
 * The original error is returned unchanged when there is nothing to add,
 * so an ordinary programming mistake is still reported as itself.
 */
export function toUpstreamError(error: unknown): Error {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error);

  const lower = message.toLowerCase();

  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return new UpstreamError(message, 'rate-limited');
  }

  if (
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('socket hang up') ||
    lower.includes('network')
  ) {
    return new UpstreamError(message, 'unreachable');
  }

  return error instanceof Error ? error : new Error(message);
}

/**
 * Surface the first failing query among a batch of parallel queries, as an
 * UpstreamError.
 *
 * Loaders often batch several reads together to feed one page - because they
 * come from different tables - and a single flaky call, a rate-limit or a
 * database outage would otherwise leave the page half built with empty slices
 * instead of reaching the friendly error boundary.
 */
export function throwOnFirstError(
  results: ReadonlyArray<{ error: unknown } | null | undefined>,
): void {
  for (const result of results) {
    if (result && result.error) {
      throw toUpstreamError(result.error);
    }
  }
}
