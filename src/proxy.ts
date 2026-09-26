import { NextResponse, type NextRequest } from 'next/server';

/**
 * Per-request Content-Security-Policy.
 *
 * Runs before every page: mint a nonce, build the policy, hand the nonce to
 * the renderer (Next reads it back out of the request's CSP header and puts it
 * on every script it emits). Headers that never vary live in next.config.ts.
 */

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],

    // `strict-dynamic`: trust what the nonced scripts load and ignore host
    // allowlists, so an injected <script src="evil.example"> is refused
    // without us maintaining a list of domains. Dev needs eval for React's
    // error overlay; production never allows it.
    'script-src': isDev
      ? ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'unsafe-eval'"]
      : ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"],

    // Next injects small inline <style> blocks it does not nonce, and the
    // live cake preview positions its text with a style attribute. No
    // user-controlled markup is ever rendered, so there is no injection point
    // for a style payload.
    'style-src': ["'self'", "'unsafe-inline'"],

    // The photo for the cake is previewed from a data: URL before upload, and
    // the 2FA QR code is a data: URL.
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],

    // Same-origin fetches only. Payment happens on Stripe's own page, reached
    // by a top-level navigation, which CSP does not govern.
    'connect-src': isDev ? ["'self'", 'ws:'] : ["'self'"],

    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    // Forms post only to this origin: an injected <form action="evil"> cannot
    // carry off what someone typed.
    'form-action': ["'self'"],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'"],
  };

  const policy = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');

  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

export function proxy(request: NextRequest): NextResponse {
  const isDev = process.env.NODE_ENV !== 'production';
  const nonce = generateNonce();
  const csp = buildCsp(nonce, isDev);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  // Static files and prefetches need no policy; API routes return JSON or
  // images, never HTML.
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|cakes/|icon).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
