import 'server-only';

import { createHash, createHmac } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { PROVIDER_IDS, isProviderId, safeReturnPath, type ProviderId, type ReturnPath } from '@/lib/accounts';
import { TTL } from '@/lib/constants';
import { env, isProduction } from '@/lib/env';
import { randomToken, safeEqual } from '@/server/security/hash';

import { decodeJwt, rsaKeyFromJwk, signEs256, verifyRs256 } from './jwt';

/**
 * Sign in with Google, Apple or Microsoft: OpenID Connect's authorization
 * code flow, written out rather than pulled in from a library, because every
 * check is the point.
 *
 *  - Leaving: a random `state` (ties the answer to this browser), a `nonce`
 *    (ties the ID token to this attempt) and, where the provider supports it,
 *    a PKCE verifier (a stolen code is useless without it). All three travel
 *    in one signed, short-lived cookie; nothing is stored server-side.
 *  - Coming back: the cookie's signature and age, `state` compared in
 *    constant time, the code exchanged over TLS with the client secret, and
 *    the ID token's signature checked against the provider's published keys,
 *    then its issuer, audience, expiry and nonce.
 */

interface Endpoints {
  authorize: string;
  token: string;
  jwks: string;
}

export interface IdTokenClaims {
  [claim: string]: unknown;
}

interface Provider {
  id: ProviderId;
  endpoints: Endpoints;
  scope: string;
  /** PKCE (RFC 7636). Apple does not offer it; state and nonce cover that ground there. */
  pkce: boolean;
  /**
   * More for the provider's page: Apple's form_post (asked for the name and
   * email, it answers with a POST from its own site), the others' account
   * chooser.
   */
  extraParams: Record<string, string>;
  clientId: () => string;
  configured: () => boolean;
  clientSecret: (now: number) => string;
  issuerOk: (claims: IdTokenClaims) => boolean;
  /**
   * Whether this provider's word that an email address belongs to the person
   * is good enough to join their sign-in to an account holding that address.
   * Microsoft lets any directory admin put any address on a user ("nOAuth"),
   * so its addresses are kept, but never trusted to join accounts.
   */
  vouchesForEmail: boolean;
}

const MICROSOFT_ISSUER = /^https:\/\/login\.microsoftonline\.com\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v2\.0$/;

/**
 * A development server can point every provider at the local mock
 * (scripts/oidc-mock.mjs). A production build ignores the variable, so no
 * setting can send a client secret anywhere but the real provider.
 */
function endpoints(id: ProviderId, real: Endpoints): Endpoints {
  const mock = !isProduction ? process.env.OIDC_MOCK_ORIGIN : undefined;
  if (!mock) return real;
  return { authorize: `${mock}/${id}/authorize`, token: `${mock}/${id}/token`, jwks: `${mock}/${id}/jwks` };
}

/** Apple takes a short-lived ES256 token, signed with the team's key, in place of a client secret. */
export function appleClientSecret(now: number): string {
  const iat = Math.floor(now / 1000);
  return signEs256(
    { kid: env.APPLE_KEY_ID, typ: 'JWT' },
    { iss: env.APPLE_TEAM_ID, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID },
    env.APPLE_PRIVATE_KEY,
  );
}

const PROVIDERS: Record<ProviderId, Provider> = {
  google: {
    id: 'google',
    endpoints: endpoints('google', {
      authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    }),
    scope: 'openid email profile',
    pkce: true,
    extraParams: { prompt: 'select_account' },
    clientId: () => env.GOOGLE_CLIENT_ID,
    configured: () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    clientSecret: () => env.GOOGLE_CLIENT_SECRET,
    // Google documents both spellings.
    issuerOk: (claims) => claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com',
    vouchesForEmail: true,
  },
  apple: {
    id: 'apple',
    endpoints: endpoints('apple', {
      authorize: 'https://appleid.apple.com/auth/authorize',
      token: 'https://appleid.apple.com/auth/token',
      jwks: 'https://appleid.apple.com/auth/keys',
    }),
    scope: 'name email',
    pkce: false,
    extraParams: { response_mode: 'form_post' },
    clientId: () => env.APPLE_CLIENT_ID,
    configured: () => Boolean(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY),
    clientSecret: appleClientSecret,
    issuerOk: (claims) => claims.iss === 'https://appleid.apple.com',
    vouchesForEmail: true,
  },
  microsoft: {
    id: 'microsoft',
    endpoints: endpoints('microsoft', {
      authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      jwks: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
    }),
    scope: 'openid email profile',
    pkce: true,
    extraParams: { prompt: 'select_account' },
    clientId: () => env.MICROSOFT_CLIENT_ID,
    configured: () => Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
    clientSecret: () => env.MICROSOFT_CLIENT_SECRET,
    // Work, school and personal accounts all sign in through /common: the
    // issuer names the person's own directory, and must name the same one
    // the token says it comes from.
    issuerOk: (claims) => {
      const match = typeof claims.iss === 'string' ? MICROSOFT_ISSUER.exec(claims.iss) : null;
      return match !== null && claims.tid === match[1];
    },
    vouchesForEmail: false,
  },
};

export function isConfigured(id: ProviderId): boolean {
  return PROVIDERS[id].configured();
}

/** The ways to sign in that are switched on, in button order. */
export function configuredProviders(): ProviderId[] {
  return PROVIDER_IDS.filter(isConfigured);
}

/** Where each provider sends people back to. It has to be registered with the provider exactly like this. */
export function callbackUrl(id: ProviderId): string {
  return `${env.APP_ORIGIN}/api/cuenta/entrar/${id}/vuelta`;
}

// ---------------------------------------------------------------------------
// The sign-in in progress, in a signed cookie
// ---------------------------------------------------------------------------

export interface PendingSignIn {
  provider: ProviderId;
  state: string;
  nonce: string;
  verifier: string | null;
  returnTo: ReturnPath;
  /** Unix milliseconds. */
  expiresAt: number;
}

function stateMac(body: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(`sign-in-state\u0000${body}`).digest('base64url');
}

export function sealPending(pending: PendingSignIn): string {
  const body = Buffer.from(
    JSON.stringify({ p: pending.provider, s: pending.state, n: pending.nonce, v: pending.verifier, r: pending.returnTo, e: pending.expiresAt }),
    'utf8',
  ).toString('base64url');
  return `${body}.${stateMac(body)}`;
}

/** The cookie's contents, if this server signed them and they have not expired. */
export function openPending(value: string | undefined, now: number): PendingSignIn | null {
  if (!value || value.length > 2048) return null;
  const [body, mac, extra] = value.split('.');
  if (!body || !mac || extra !== undefined || !safeEqual(mac, stateMac(body))) return null;
  try {
    const raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (!isProviderId(raw.p) || typeof raw.s !== 'string' || typeof raw.n !== 'string') return null;
    if (raw.v !== null && typeof raw.v !== 'string') return null;
    if (typeof raw.e !== 'number' || raw.e <= now) return null;
    return { provider: raw.p, state: raw.s, nonce: raw.n, verifier: raw.v, returnTo: safeReturnPath(raw.r), expiresAt: raw.e };
  } catch {
    return null;
  }
}

/** The provider's sign-in page to send the person to, and the cookie that remembers why. */
export function authorizationRequest(id: ProviderId, returnTo: ReturnPath, now: number): { url: string; pending: PendingSignIn } {
  const provider = PROVIDERS[id];
  const pending: PendingSignIn = {
    provider: id,
    state: randomToken(24),
    nonce: randomToken(24),
    verifier: provider.pkce ? randomToken(48) : null,
    returnTo,
    expiresAt: now + TTL.signIn * 1000,
  };
  const url = new URL(provider.endpoints.authorize);
  const params: Record<string, string> = {
    client_id: provider.clientId(),
    redirect_uri: callbackUrl(id),
    response_type: 'code',
    scope: provider.scope,
    state: pending.state,
    nonce: pending.nonce,
    ...provider.extraParams,
  };
  if (pending.verifier) {
    params.code_challenge = createHash('sha256').update(pending.verifier).digest('base64url');
    params.code_challenge_method = 'S256';
  }
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return { url: url.toString(), pending };
}

// ---------------------------------------------------------------------------
// Coming back: the code for an ID token, and the token checked
// ---------------------------------------------------------------------------

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...args) => fetch(...args);

/** Tests replace the network with fake providers. */
export function setOidcFetch(impl: Fetch | null): void {
  fetchImpl = impl ?? ((...args) => fetch(...args));
  jwksCache.clear();
}

export class SignInFailed extends Error {
  constructor(reason: string) {
    super(`Sign-in rejected: ${reason}`);
    this.name = 'SignInFailed';
  }
}

const NETWORK_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 256_000;

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new SignInFailed('response too large');
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new SignInFailed('response is not an object');
  return value as Record<string, unknown>;
}

/** The authorization code for an ID token, straight from the provider over TLS. */
export async function exchangeCode(id: ProviderId, code: string, verifier: string | null, now: number): Promise<string> {
  const provider = PROVIDERS[id];
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl(id),
    client_id: provider.clientId(),
    client_secret: provider.clientSecret(now),
  });
  if (verifier) body.set('code_verifier', verifier);
  const response = await fetchImpl(provider.endpoints.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) {
    // The provider's error code says why (an expired code, a wrong secret);
    // its description can echo request details, so only the code is logged.
    const error = await readJson(response).then((r) => r.error, () => undefined);
    throw new SignInFailed(`token endpoint answered ${response.status} ${typeof error === 'string' ? error.slice(0, 60) : ''}`);
  }
  const json = await readJson(response);
  if (typeof json.id_token !== 'string') throw new SignInFailed('no id_token');
  return json.id_token;
}

/** Signing keys, per provider. They rotate rarely; an unknown key id triggers one early refetch. */
const jwksCache = new Map<ProviderId, { keys: Map<string, KeyObject>; fetchedAt: number }>();
const JWKS_MAX_AGE_MS = 60 * 60 * 1000;
const JWKS_MIN_REFETCH_MS = 60 * 1000;

async function fetchJwks(provider: Provider): Promise<Map<string, KeyObject>> {
  const response = await fetchImpl(provider.endpoints.jwks, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new SignInFailed(`keys answered ${response.status}`);
  const json = await readJson(response);
  const keys = new Map<string, KeyObject>();
  for (const jwk of Array.isArray(json.keys) ? json.keys : []) {
    const parsed = rsaKeyFromJwk(jwk);
    if (parsed) keys.set(parsed.kid, parsed.key);
  }
  return keys;
}

async function signingKey(provider: Provider, kid: string, now: number): Promise<KeyObject | null> {
  let cached = jwksCache.get(provider.id);
  const stale = !cached || now - cached.fetchedAt > JWKS_MAX_AGE_MS;
  const unknownKid = cached !== undefined && !cached.keys.has(kid) && now - cached.fetchedAt > JWKS_MIN_REFETCH_MS;
  if (stale || unknownKid) {
    try {
      cached = { keys: await fetchJwks(provider), fetchedAt: now };
      jwksCache.set(provider.id, cached);
    } catch (error) {
      // Keys we already hold are still good for tokens they signed.
      if (!cached) throw error;
    }
  }
  return cached?.keys.get(kid) ?? null;
}

export interface VerifiedIdentity {
  provider: ProviderId;
  /** The provider's id for the person: stable, never reassigned. */
  subject: string;
  email: string | null;
  /** True only when the provider vouches for the address and we trust it to (see `vouchesForEmail`). */
  emailVerified: boolean;
  name: string | null;
}

/** Leeway for clocks that disagree a little. */
const CLOCK_SKEW_S = 60;

function claimString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return trimmed === '' || trimmed.length > max ? null : trimmed;
}

/** Signature, issuer, audience, time and nonce. Throws on the first thing that is not right. */
export async function verifyIdToken(id: ProviderId, token: string, expectedNonce: string, now: number): Promise<VerifiedIdentity> {
  const provider = PROVIDERS[id];
  const decoded = decodeJwt(token);
  if (!decoded) throw new SignInFailed('malformed token');
  // Only RS256: never "none", never an HMAC keyed with a public key.
  if (decoded.header.alg !== 'RS256' || typeof decoded.header.kid !== 'string') throw new SignInFailed('unexpected algorithm');
  const key = await signingKey(provider, decoded.header.kid, now);
  if (!key || !verifyRs256(decoded, key)) throw new SignInFailed('bad signature');

  const claims = decoded.payload;
  if (!provider.issuerOk(claims)) throw new SignInFailed('wrong issuer');

  const clientId = provider.clientId();
  if (!clientId) throw new SignInFailed('provider not configured');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(clientId)) throw new SignInFailed('wrong audience');
  if (audiences.length > 1 && claims.azp !== clientId) throw new SignInFailed('wrong authorized party');

  const nowS = Math.floor(now / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S <= nowS) throw new SignInFailed('expired');
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_S > nowS) throw new SignInFailed('not yet valid');
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_S * 5 > nowS) throw new SignInFailed('issued in the future');

  if (typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, expectedNonce)) throw new SignInFailed('wrong nonce');

  const subject = claimString(claims.sub, 255);
  if (!subject) throw new SignInFailed('no subject');

  const rawEmail = claimString(claims.email, 254)?.toLowerCase() ?? null;
  const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : null;
  // Apple sends the flag as the string "true".
  const flagged = claims.email_verified === true || claims.email_verified === 'true';

  return {
    provider: id,
    subject,
    email,
    emailVerified: email !== null && flagged && provider.vouchesForEmail,
    name: claimString(claims.name, 120),
  };
}

/**
 * Apple sends the person's name once, the first time they share it, as JSON
 * in the form it posts back (never inside the ID token). It is not signed, so
 * it is used for the name only and never for the email address.
 */
export function appleNameFromForm(user: string | null): string | null {
  if (!user || user.length > 2048) return null;
  try {
    const parsed = JSON.parse(user) as { name?: { firstName?: unknown; lastName?: unknown } };
    const parts = [claimString(parsed.name?.firstName, 60), claimString(parsed.name?.lastName, 60)].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : null;
  } catch {
    return null;
  }
}
