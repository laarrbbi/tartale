import { NextResponse } from 'next/server';

import { isProviderId, safeReturnPath, type SignInErrorCode } from '@/lib/accounts';
import { env } from '@/lib/env';
import { signInCookie } from '@/server/auth/customer-session';
import { isConfigured } from '@/server/auth/oidc';
import { customerAccountsReady } from '@/server/repositories/customers';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { getClientIp } from '@/server/security/request';
import { startSignIn } from '@/server/services/sign-in-service';

export const dynamic = 'force-dynamic';

/**
 * "Continuar con Google" (or Apple, or Microsoft): off to the provider's own
 * page, carrying a fresh state, nonce and PKCE challenge. A plain link, not a
 * form: the page's CSP only lets forms post to this site, and a browser
 * applies that to where the form's answer redirects too.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }): Promise<NextResponse> {
  const { provider } = await params;
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get('volver'));
  const back = (error: SignInErrorCode) =>
    NextResponse.redirect(new URL(`/entrar?error=${error}&volver=${encodeURIComponent(returnTo)}`, env.APP_ORIGIN), 303);

  if (!isProviderId(provider) || !isConfigured(provider) || !(await customerAccountsReady())) return back('no-disponible');
  if (!(await consume(RULES.signIn, hashIp(await getClientIp()) ?? ANONYMOUS_BUCKET)).allowed) return back('limite');

  const { url, cookieValue } = startSignIn(provider, returnTo);
  const response = NextResponse.redirect(url, 303);
  const cookie = signInCookie(cookieValue);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  response.headers.set('cache-control', 'no-store');
  return response;
}
