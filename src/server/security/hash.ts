import 'server-only';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/env';

/** CSPRNG entropy, URL-safe. 16 bytes is 22 characters, 32 bytes is 43. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Digest of a bearer token for storage. Plain SHA-256 is right here: the
 * input already has 256 bits of entropy, so there is nothing to brute-force;
 * the point is only that a database dump yields no replayable tokens.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/** Constant-time comparison of two strings of any length. */
export function safeEqual(a: string, b: string): boolean {
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length; hashing both sides first compares 32 bytes to 32 bytes.
  return timingSafeEqual(
    createHash('sha256').update(Buffer.from(a, 'utf8')).digest(),
    createHash('sha256').update(Buffer.from(b, 'utf8')).digest(),
  );
}

/**
 * Pseudonymised client address: enough to count requests from one place for
 * rate limiting, not enough to recover the IP (an unkeyed hash of every IPv4
 * address is a few seconds of brute force, hence the HMAC pepper).
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac('sha256', env.IP_HASH_SECRET).update(ip).digest('base64url').slice(0, 22);
}
