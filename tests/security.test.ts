import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';

import nextConfig from '../next.config';
import { COOKIES, CSRF_FIELD } from '../src/lib/constants';
import { buildCsp } from '../src/proxy';
import { isPublicId } from '../src/server/http/body';
import { createUser, claimTotpStep, enableTotp, setPendingTotp } from '../src/server/repositories/users';
import { hashToken, randomToken, safeEqual } from '../src/server/security/hash';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../src/server/security/password';
import { RULES, consume } from '../src/server/security/rate-limit';
import { originMatches } from '../src/server/security/request';
import { base32Encode, matchTotp, totpCode } from '../src/server/security/totp';
import { newPublicId } from '../src/server/services/order-service';

import { resetTestDb, startTestDb, stopTestDb } from './pg-harness';

before(() => startTestDb());
beforeEach(() => resetTestDb({ seed: false }));
after(stopTestDb);

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function filesUnder(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(rel, match));
    else if (match.test(entry.name)) out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

test('CSP: scripts only with this request’s nonce, no inline or eval, no framing, forms stay home', () => {
  const csp = buildCsp('bm9uY2U=', false);
  const directive = (name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';
  assert.match(directive('script-src'), /'nonce-bm9uY2U='/);
  assert.match(directive('script-src'), /'strict-dynamic'/);
  assert.doesNotMatch(directive('script-src'), /unsafe-inline|unsafe-eval/);
  assert.equal(directive('frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(directive('object-src'), "object-src 'none'");
  assert.equal(directive('base-uri'), "base-uri 'self'");
  assert.equal(directive('form-action'), "form-action 'self'");
  assert.equal(directive('connect-src'), "connect-src 'self'");
  assert.match(csp, /upgrade-insecure-requests$/);
  assert.match(buildCsp('x', true), /'unsafe-eval'/, 'only the dev server gets eval, for its error overlay');
});

test('headers: HSTS with preload everywhere; tracking and invoice links are never indexed nor leaked as a referrer', async () => {
  const rules = (await nextConfig.headers!()) as { source: string; headers: { key: string; value: string }[] }[];
  const get = (source: string, key: string) => rules.find((r) => r.source === source)?.headers.find((h) => h.key === key)?.value;
  assert.match(get('/:path*', 'Strict-Transport-Security') ?? '', /max-age=\d{8,}; includeSubDomains; preload/);
  assert.equal(get('/:path*', 'X-Frame-Options'), 'DENY');
  assert.equal(get('/:path*', 'X-Content-Type-Options'), 'nosniff');
  assert.equal(get('/pedido/:path*', 'Referrer-Policy'), 'no-referrer');
  assert.match(get('/pedido/:path*', 'X-Robots-Tag') ?? '', /noindex/);
  assert.equal(get('/factura/:path*', 'Referrer-Policy'), 'no-referrer');
  assert.match(get('/factura/:path*', 'X-Robots-Tag') ?? '', /noindex/);
  assert.match(get('/admin/:path*', 'X-Robots-Tag') ?? '', /noindex/);
  assert.equal(nextConfig.poweredByHeader, false);
});

test('cookies: every one is __Host- in production, so no subdomain can set or read it', () => {
  for (const name of Object.values(COOKIES)) assert.match(name, /^__Host-/);
});

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

test('same origin: Origin must match exactly; Referer is the fallback; neither is a refusal', () => {
  const app = 'https://tartale.test';
  assert.equal(originMatches('https://tartale.test', null, app), true);
  assert.equal(originMatches('https://evil.test', 'https://tartale.test/enviar', app), false, 'Origin wins over Referer');
  assert.equal(originMatches('https://tartale.test.evil.test', null, app), false);
  assert.equal(originMatches('http://tartale.test', null, app), false, 'plain http is another origin');
  assert.equal(originMatches(null, 'https://tartale.test/admin', app), true);
  assert.equal(originMatches(null, 'https://evil.test/?https://tartale.test', app), false);
  assert.equal(originMatches(null, 'not a url', app), false);
  assert.equal(originMatches(null, null, app), false);
});

test('rate limits: counted in the database, per rule and per caller', async () => {
  const rule = { name: 'test', limit: 3, windowSeconds: 600 };
  const results = [];
  for (let i = 0; i < 4; i++) results.push((await consume(rule, '198.51.100.7')).allowed);
  assert.deepEqual(results, [true, true, true, false]);
  assert.equal((await consume(rule, '198.51.100.8')).allowed, true, 'another caller has their own budget');
  assert.equal((await consume({ ...rule, name: 'other' }, '198.51.100.7')).allowed, true, 'another rule has its own counter');
  assert.ok(RULES.login.limit <= 10 && RULES.order.limit <= 10, 'the public budgets stay tight');
});

test('tracking links: 22 random url-safe characters, and nothing shorter is even looked up', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newPublicId()));
  assert.equal(ids.size, 200);
  for (const id of ids) {
    assert.match(id, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(isPublicId(id), true);
  }
  assert.equal(isPublicId('abc123'), false);
  assert.equal(isPublicId('../../etc/passwd/xxxxxxxx'), false);
});

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

test('passwords: scrypt, salted, and a wrong one is refused', async () => {
  const a = await hashPassword('una frase bastante larga');
  const b = await hashPassword('una frase bastante larga');
  assert.notEqual(a, b, 'a fresh salt each time');
  assert.match(a, /^scrypt\$/);
  assert.equal(await verifyPassword('una frase bastante larga', a), true);
  assert.equal(await verifyPassword('una frase bastante largA', a), false);
  assert.equal(await verifyPassword('', a), false);
  assert.match(generateTemporaryPassword(), /^[a-hjkmnp-z2-9]{5}(-[a-hjkmnp-z2-9]{5}){3}$/);
});

test('two-step codes: RFC 6238 test vectors, a minute of drift, and each code works once', async () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totpCode(secret, Math.floor(59 / 30)), '287082');
  assert.equal(totpCode(secret, Math.floor(1111111109 / 30)), '081804');
  assert.equal(totpCode(secret, Math.floor(1234567890 / 30)), '005924');

  const now = 1_700_000_000_000;
  const step = Math.floor(now / 30_000);
  assert.equal(matchTotp(secret, totpCode(secret, step), now), step);
  assert.equal(matchTotp(secret, totpCode(secret, step - 1), now), step - 1);
  assert.equal(matchTotp(secret, totpCode(secret, step - 3), now), null, 'an old code is refused');
  assert.equal(matchTotp(secret, 'abcdef', now), null);

  const userId = await createUser({ email: 'dueña@tartale.test', passwordHash: 'x', displayName: 'Dueña', role: 'owner' });
  await setPendingTotp(userId, secret);
  await enableTotp(userId, step - 1);
  assert.equal(await claimTotpStep(userId, step), true);
  assert.equal(await claimTotpStep(userId, step), false, 'the same code twice is a replay');
  assert.equal(await claimTotpStep(userId, step - 1), false, 'and so is an earlier one');
});

test('tokens: random, hashed before storage, compared in constant time', () => {
  const token = randomToken();
  assert.ok(token.length >= 43);
  assert.notEqual(hashToken(token), token);
  assert.equal(hashToken(token), hashToken(token));
  assert.equal(safeEqual(token, token), true);
  assert.equal(safeEqual(token, `${token}x`), false);
});

// ---------------------------------------------------------------------------
// The panel, read from its source: every door is locked the same way
// ---------------------------------------------------------------------------

interface ExportedAction {
  file: string;
  name: string;
  body: string;
}

function serverActions(): ExportedAction[] {
  const out: ExportedAction[] = [];
  for (const file of filesUnder('src/server/actions', /\.ts$/)) {
    const source = read(file);
    if (!/^'use server';/.test(source)) continue;
    const pattern = /export async function (\w+)\(/g;
    const starts = [...source.matchAll(pattern)];
    starts.forEach((match, i) => {
      const end = i + 1 < starts.length ? starts[i + 1]!.index : source.length;
      out.push({ file, name: match[1]!, body: source.slice(match.index, end) });
    });
  }
  return out;
}

const OWNER_ONLY_FILES = ['bakery-actions.ts', 'settings-actions.ts', 'team-actions.ts', 'birthday-actions.ts', 'invoice-actions.ts'];
const OWNER_ONLY_ORDER_ACTIONS = [
  'cancelOrderAction',
  'restoreOrderAction',
  'refundOrderAction',
  'manualPaymentAction',
  'eraseOrderAction',
  'deleteOrderAction',
];

test('every panel action checks origin and CSRF token before anything else', () => {
  const actions = serverActions();
  assert.ok(actions.length >= 20, `found ${actions.length} actions`);
  for (const action of actions) {
    const firstAwait = /await ([\w.]+)\(/.exec(action.body)?.[1];
    if (action.name === 'loginAction') {
      // No session yet to bind a token to: the Origin check stands alone.
      assert.equal(firstAwait, 'isSameOrigin', `${action.file}: ${action.name}`);
    } else {
      assert.ok(firstAwait === 'beginMutation' || firstAwait === 'assertCsrf', `${action.file}: ${action.name} starts with ${firstAwait}`);
    }
  }
});

test('money, settings, the catalog and the team: owner only, checked on the server', () => {
  for (const action of serverActions()) {
    const ownerOnly =
      OWNER_ONLY_FILES.includes(path.basename(action.file)) || OWNER_ONLY_ORDER_ACTIONS.includes(action.name);
    if (!ownerOnly) continue;
    assert.match(action.body, /beginMutation\(formData, \{ requireRole: 'owner' \}\)/, `${action.file}: ${action.name}`);
  }
});

test('every panel page asks for a session; the owner’s pages for the owner', () => {
  const pages = filesUnder('src/app/admin', /^(page|layout)\.tsx$/).filter((f) => !f.includes(`${path.sep}login${path.sep}`));
  assert.ok(pages.length >= 8);
  for (const page of pages) {
    assert.match(read(page), /await require(Session|Owner)\(/, page);
  }
  for (const section of ['ajustes', 'equipo', 'actividad', 'cumpleanos', 'cumpleanos/[id]', 'facturas', 'facturas/[id]']) {
    const page = path.join('src/app/admin/(panel)', section, 'page.tsx');
    assert.match(read(page), /await requireOwner\(\)/, page);
  }
});

test('every panel form carries the CSRF token', () => {
  const files = [...filesUnder('src/app/admin', /\.tsx$/), ...filesUnder('src/components/admin', /\.tsx$/)];
  for (const file of files) {
    const source = read(file);
    if (!/<form[\s>]/.test(source) || file.endsWith('login-form.tsx')) continue;
    assert.ok(source.includes('CSRF_FIELD'), `${file} has a <form> without the token`);
  }
  assert.equal(CSRF_FIELD, 'csrfToken');
});
