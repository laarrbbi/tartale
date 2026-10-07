import 'server-only';

import { createPrivateKey, createPublicKey, sign, verify, type JsonWebKey, type KeyObject } from 'node:crypto';

/**
 * The little of JSON Web Tokens that sign-in needs, on node:crypto: reading a
 * token, checking an RS256 signature against a provider's published key, and
 * signing the ES256 token Apple takes in place of a client secret. Nothing
 * here decides whether a token is acceptable; services/sign-in and
 * auth/oidc do, claim by claim.
 */

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** `header.payload`, exactly as received: the bytes the signature covers. */
  signingInput: string;
  signature: Buffer;
}

/** Far above any real ID token; a bigger one is not worth parsing. */
const MAX_TOKEN_LENGTH = 16_384;
const SEGMENT = /^[A-Za-z0-9_-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/** Splits and parses a compact token. Null for anything malformed; nothing in it is trusted yet. */
export function decodeJwt(token: string): DecodedJwt | null {
  if (token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every((part) => SEGMENT.test(part))) return null;
  try {
    const header: unknown = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
    const payload: unknown = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    if (!isRecord(header) || !isRecord(payload)) return null;
    return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2]!, 'base64url') };
  } catch {
    return null;
  }
}

/**
 * A provider's signing key, from its published JWK set. Only RSA signing keys
 * of 2048 bits or more: a key meant for encryption, or for another algorithm,
 * is refused rather than tried.
 */
export function rsaKeyFromJwk(jwk: unknown): { kid: string; key: KeyObject } | null {
  if (!isRecord(jwk) || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string' || jwk.kid === '') return null;
  if (jwk.use !== undefined && jwk.use !== 'sig') return null;
  if (jwk.alg !== undefined && jwk.alg !== 'RS256') return null;
  if (typeof jwk.n !== 'string' || typeof jwk.e !== 'string') return null;
  try {
    const key = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e } as JsonWebKey, format: 'jwk' });
    const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
    return bits >= 2048 ? { kid: jwk.kid, key } : null;
  } catch {
    return null;
  }
}

/** RSASSA-PKCS1-v1_5 with SHA-256, the only algorithm the three providers sign ID tokens with. */
export function verifyRs256(token: DecodedJwt, key: KeyObject): boolean {
  if (token.header.alg !== 'RS256' || key.asymmetricKeyType !== 'rsa') return false;
  try {
    return verify('RSA-SHA256', Buffer.from(token.signingInput, 'utf8'), key, token.signature);
  } catch {
    return false;
  }
}

/** ES256 (P-256, SHA-256), with the signature as the raw r‖s pair JWS expects rather than DER. */
export function signEs256(header: Record<string, unknown>, payload: Record<string, unknown>, privateKeyPem: string): string {
  const input = `${encodeSegment({ ...header, alg: 'ES256' })}.${encodeSegment(payload)}`;
  const signature = sign('sha256', Buffer.from(input, 'utf8'), { key: createPrivateKey(privateKeyPem), dsaEncoding: 'ieee-p1363' });
  return `${input}.${signature.toString('base64url')}`;
}
