import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { isProviderId, type ReturnPath, type SignInErrorCode } from '@/lib/accounts';
import { env } from '@/lib/env';
import { SIGN_IN_COOKIE, openCustomerSession, revokeCurrentCustomerSession, signInCookie } from '@/server/auth/customer-session';
import { isConfigured } from '@/server/auth/oidc';
import { readBodyText } from '@/server/http/body';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { getClientIp } from '@/server/security/request';
import { finishSignIn } from '@/server/services/sign-in-service';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ provider: string }> };

/** Google and Microsoft send the person back here with a GET. */
export async function GET(request: Request, context: Context): Promise<NextResponse> {
  return finish(context, new URL(request.url).searchParams);
}

/**
 * Apple posts a form from its own page (response_mode=form_post). This is the
 * one POST on the site that comes from another origin by design, so the
 * same-origin check every other POST passes cannot apply: the signed state
 * cookie, set by this browser on the way out and compared in constant time,
 * stands in for it, and the code is worthless without the client secret.
 */
export async function POST(request: Request, context: Context): Promise<NextResponse> {
  let body = '';
  try {
    body = await readBodyText(request, 16_384);
  } catch {
    body = '';
  }
  return finish(context, new URLSearchParams(body));
}

function redirectTo(path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, env.APP_ORIGIN), 303);
  response.headers.set('cache-control', 'no-store');
  return response;
}

function back(error: SignInErrorCode, returnTo: ReturnPath = '/cuenta'): NextResponse {
  return redirectTo(`/entrar?error=${error}&volver=${encodeURIComponent(returnTo)}`);
}

async function finish({ params }: Context, query: URLSearchParams): Promise<NextResponse> {
  const { provider } = await params;
  const pendingCookie = (await cookies()).get(SIGN_IN_COOKIE)?.value;
  const response = await answer(provider, query, pendingCookie);
  // Single use, whatever happened.
  const cleared = signInCookie('', 0);
  response.cookies.set(cleared.name, cleared.value, cleared.options);
  return response;
}

async function answer(provider: string, query: URLSearchParams, pendingCookie: string | undefined): Promise<NextResponse> {
  if (!isProviderId(provider) || !isConfigured(provider)) return back('no-disponible');
  if (!(await consume(RULES.signIn, hashIp(await getClientIp()) ?? ANONYMOUS_BUCKET)).allowed) return back('limite');

  const outcome = await finishSignIn({ provider, params: query, pendingCookie });
  if (!outcome.ok) return back(outcome.error, outcome.returnTo);

  await revokeCurrentCustomerSession();
  const session = await openCustomerSession(outcome.customerId);
  const response = redirectTo(outcome.returnTo);
  response.cookies.set(session.name, session.value, session.options);
  return response;
}
