import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time codes (RFC 6238) — what Google Authenticator, Microsoft
 * Authenticator, 1Password and the iPhone's own password app all speak.
 *
 * Written against node:crypto rather than pulled in: it is forty lines of
 * HMAC, and a login dependency is the last place to add supply-chain surface.
 * SHA-1, 6 digits and 30 seconds are not a choice — they are the only
 * parameters every authenticator app honours.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
/** One step either side: a phone clock 30 s off, or a code typed as it rolled over. */
const DRIFT_STEPS = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Not base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 random bits, the size RFC 4226 recommends, as the base32 the apps expect. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function currentStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

/** The code for one time step (RFC 4226 HOTP with the step as the counter). */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Digits only: people type "123 456" and paste "123-456". */
export function normaliseCode(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/**
 * The time step `code` belongs to, or null. The caller must then refuse any
 * step it has already accepted, or a code seen over a shoulder stays good for
 * its whole minute.
 */
export function matchTotp(secret: string, input: string, nowMs = Date.now()): number | null {
  const code = normaliseCode(input);
  if (!/^\d{6}$/.test(code)) return null;
  const now = currentStep(nowMs);
  let matched: number | null = null;
  // Every candidate is compared, in constant time, so the response time does
  // not say which window matched.
  for (let step = now - DRIFT_STEPS; step <= now + DRIFT_STEPS; step++) {
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code))) matched = step;
  }
  return matched;
}

/** What the QR code encodes: the account, the issuer, and the secret. */
export function otpauthUrl(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
