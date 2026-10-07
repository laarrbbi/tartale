import assert from 'node:assert/strict';
import { createHash, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import test, { after, afterEach, before, beforeEach } from 'node:test';

import { safeReturnPath, signInErrorMessage, type ProviderId } from '../src/lib/accounts';
import { RETENTION_DAYS } from '../src/lib/constants';
import { addDays, madridToday, weekday } from '../src/lib/dates';
import { customerCsrfToken } from '../src/server/auth/customer-session';
import { decodeJwt } from '../src/server/auth/jwt';
import {
  appleClientSecret,
  appleNameFromForm,
  callbackUrl,
  configuredProviders,
  openPending,
  sealPending,
  setOidcFetch,
} from '../src/server/auth/oidc';
import { listCakes } from '../src/server/repositories/catalog';
import {
  customerAccountsReady,
  deleteCustomer,
  findCustomerSession,
  getCustomer,
  getCustomerBilling,
  insertCustomerSession,
  listCustomerOrders,
  revokeCustomerSession,
} from '../src/server/repositories/customers';
import { hashToken } from '../src/server/security/hash';
import { placeOrder } from '../src/server/services/order-service';
import { runRetention } from '../src/server/services/retention-service';
import { finishSignIn, startSignIn, type SignInOutcome } from '../src/server/services/sign-in-service';
import { accountDetailsSchema, orderInputSchema } from '../src/server/validation/schemas';

import { installFakeStripe, type FakeStripe } from './fake-stripe';
import { countRows, resetTestDb, sqlOne, sqlRun, startTestDb, stopTestDb } from './pg-harness';

// ---------------------------------------------------------------------------
// Three fake providers that sign real RS256 tokens with a key made for this run
// ---------------------------------------------------------------------------

const { privateKey: PROVIDER_KEY, publicKey: PROVIDER_PUBLIC } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';
const PERSONAL_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';

const ISSUERS: Record<ProviderId, string> = {
  google: 'https://accounts.google.com',
  apple: 'https://appleid.apple.com',
  microsoft: `https://login.microsoftonline.com/${PERSONAL_TENANT}/v2.0`,
};
const CLIENT_IDS: Record<ProviderId, string> = {
  google: process.env.GOOGLE_CLIENT_ID!,
  apple: process.env.APPLE_CLIENT_ID!,
  microsoft: process.env.MICROSOFT_CLIENT_ID!,
};

const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function signToken(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: KID, typ: 'JWT' }, key: KeyObject = PROVIDER_KEY): string {
  const input = `${segment(header)}.${segment(claims)}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
}

interface FakeProviders {
  /** The ID token the token endpoint answers with next. */
  token: () => string;
  tokenRequests: { url: string; body: URLSearchParams }[];
  keyRequests: number;
  tokenStatus: number;
}

let fake: FakeProviders;

function installFakeProviders(): FakeProviders {
  const state: FakeProviders = { token: () => '', tokenRequests: [], keyRequests: 0, tokenStatus: 200 };
  setOidcFetch(async (input, init) => {
    const url = String(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (/certs$|auth\/keys$|discovery\/v2\.0\/keys$/.test(url)) {
      state.keyRequests++;
      return json({ keys: [{ ...PROVIDER_PUBLIC.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' }] });
    }
    if (/oauth2\.googleapis\.com\/token$|appleid\.apple\.com\/auth\/token$|oauth2\/v2\.0\/token$/.test(url)) {
      const body = new URLSearchParams(String(init?.body ?? ''));
      state.tokenRequests.push({ url, body });
      if (state.tokenStatus !== 200) return json({ error: 'invalid_grant' }, state.tokenStatus);
      return json({ id_token: state.token(), access_token: 'unused', token_type: 'Bearer' });
    }
    throw new Error(`unexpected request to ${url}`);
  });
  return state;
}

const nowS = () => Math.floor(Date.now() / 1000);

/** Claims a provider would really send, for `provider`, with `extra` on top. */
function claimsFor(provider: ProviderId, nonce: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    iss: ISSUERS[provider],
    aud: CLIENT_IDS[provider],
    sub: `${provider}-user-1`,
    iat: nowS(),
    exp: nowS() + 600,
    nonce,
  };
  if (provider === 'microsoft') base.tid = PERSONAL_TENANT;
  return { ...base, ...extra };
}

/** The whole round trip: leave, come back with the code, as a browser would. */
async function signIn(
  provider: ProviderId,
  extra: Record<string, unknown> = {},
  options: { params?: Record<string, string>; cookie?: (cookie: string) => string | undefined; token?: (nonce: string) => string } = {},
): Promise<SignInOutcome> {
  const { url, cookieValue } = startSignIn(provider, '/enviar');
  const authorize = new URL(url);
  const nonce = authorize.searchParams.get('nonce')!;
  // What the provider signs carries the nonce this attempt sent.
  fake.token = () => (options.token ?? ((n: string) => signToken(claimsFor(provider, n, extra))))(nonce);
  const params = new URLSearchParams({ code: 'code-from-provider', state: authorize.searchParams.get('state')!, ...options.params });
  return finishSignIn({ provider, params, pendingCookie: options.cookie ? options.cookie(cookieValue) : cookieValue });
}

let stripe: FakeStripe;

before(() => startTestDb());
beforeEach(async () => {
  await resetTestDb();
  fake = installFakeProviders();
  stripe = installFakeStripe();
});
afterEach(() => {
  setOidcFetch(null);
  stripe.restore();
});
after(stopTestDb);

// ---------------------------------------------------------------------------
// Leaving for the provider
// ---------------------------------------------------------------------------

test('the way out: state, nonce and PKCE (S256) for Google and Microsoft, form_post for Apple, and our own callback', () => {
  assert.deepEqual(configuredProviders(), ['google', 'apple', 'microsoft']);

  const google = startSignIn('google', '/cuenta');
  const url = new URL(google.url);
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), CLIENT_IDS.google);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://tartame.test/api/cuenta/entrar/google/vuelta');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  const pending = openPending(google.cookieValue, Date.now())!;
  assert.equal(url.searchParams.get('state'), pending.state);
  assert.equal(url.searchParams.get('nonce'), pending.nonce);
  assert.ok(pending.state.length >= 32 && pending.nonce.length >= 32);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(pending.verifier!).digest('base64url'));

  const apple = new URL(startSignIn('apple', '/cuenta').url);
  assert.equal(apple.origin, 'https://appleid.apple.com');
  assert.equal(apple.searchParams.get('response_mode'), 'form_post');
  assert.equal(apple.searchParams.get('scope'), 'name email');
  assert.equal(apple.searchParams.get('code_challenge'), null, 'Apple offers no PKCE');

  const microsoft = new URL(startSignIn('microsoft', '/cuenta').url);
  assert.equal(microsoft.origin + microsoft.pathname, 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  assert.equal(microsoft.searchParams.get('code_challenge_method'), 'S256');

  assert.equal(callbackUrl('apple'), 'https://tartame.test/api/cuenta/entrar/apple/vuelta');
  assert.notEqual(startSignIn('google', '/cuenta').cookieValue, google.cookieValue, 'fresh values every time');
});

test('the sign-in cookie: signed by us, and only for ten minutes', () => {
  const now = Date.now();
  const { cookieValue } = startSignIn('google', '/enviar', now);
  assert.equal(openPending(cookieValue, now)?.returnTo, '/enviar');
  assert.equal(openPending(cookieValue, now + 11 * 60 * 1000), null, 'expired');

  const [body, mac] = cookieValue.split('.');
  const forged = JSON.parse(Buffer.from(body!, 'base64url').toString());
  forged.p = 'microsoft';
  const forgedBody = Buffer.from(JSON.stringify(forged)).toString('base64url');
  assert.equal(openPending(`${forgedBody}.${mac}`, now), null, 'a changed body breaks the signature');
  const wrongKey = createHmac('sha256', 'not-our-secret-not-our-secret-not-ours').update(`sign-in-state\u0000${forgedBody}`).digest('base64url');
  assert.equal(openPending(`${forgedBody}.${wrongKey}`, now), null, 'and nobody else can sign one');
  assert.equal(openPending(`${cookieValue}.extra`, now), null);
  assert.equal(openPending(undefined, now), null);

  // Even our own signature cannot smuggle in somewhere else to go afterwards.
  const evil = sealPending({ ...openPending(cookieValue, now)!, returnTo: 'https://evil.test' as '/cuenta' });
  assert.equal(openPending(evil, now)?.returnTo, '/cuenta');
});

test('where people go afterwards: only our own pages, never a URL from the query', () => {
  assert.equal(safeReturnPath('/enviar'), '/enviar');
  assert.equal(safeReturnPath('/cuenta'), '/cuenta');
  for (const sneaky of ['//evil.test', 'https://evil.test', '/\\evil.test', '/enviar/../admin', '', null, ['/enviar']]) {
    assert.equal(safeReturnPath(sneaky), '/cuenta', String(sneaky));
  }
  assert.equal(signInErrorMessage('caducado')?.startsWith('El inicio'), true);
  assert.equal(signInErrorMessage('constructor'), null, 'no prototype keys');
});

// ---------------------------------------------------------------------------
// Coming back
// ---------------------------------------------------------------------------

test('Google: the first sign-in creates the account, the next ones find it', async () => {
  const first = await signIn('google', { email: 'Ana@Empresa.es', email_verified: true, name: 'Ana Pérez' });
  assert.deepEqual(first, { ok: true, customerId: 1, returnTo: '/enviar' });
  const customer = (await getCustomer(1))!;
  assert.equal(customer.email, 'ana@empresa.es');
  assert.equal(customer.emailVerified, true);
  assert.equal(customer.name, 'Ana Pérez');

  // The code went to Google with the secret and the PKCE verifier, to our own callback.
  const request = fake.tokenRequests[0]!;
  assert.equal(request.url, 'https://oauth2.googleapis.com/token');
  assert.equal(request.body.get('grant_type'), 'authorization_code');
  assert.equal(request.body.get('code'), 'code-from-provider');
  assert.equal(request.body.get('client_secret'), process.env.GOOGLE_CLIENT_SECRET);
  assert.equal(request.body.get('redirect_uri'), 'https://tartame.test/api/cuenta/entrar/google/vuelta');
  assert.match(request.body.get('code_verifier') ?? '', /^[A-Za-z0-9_-]{43,128}$/);

  const again = await signIn('google', { email: 'ana@empresa.es', email_verified: true, name: 'Otro Nombre' });
  assert.equal(again.ok && again.customerId, 1);
  assert.equal(await countRows('customers'), 1);
  assert.equal((await getCustomer(1))!.name, 'Ana Pérez', 'a saved name is not overwritten by the provider');
  assert.equal(fake.keyRequests, 1, 'the provider keys are fetched once and kept');
});

test('a forged or mistaken ID token never signs anyone in', async () => {
  const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cases: [string, (nonce: string) => string][] = [
    ['another nonce', () => signToken(claimsFor('google', 'not-the-nonce'))],
    ['another audience', (n) => signToken(claimsFor('google', n, { aud: 'someone-elses-app' }))],
    ['two audiences without azp', (n) => signToken(claimsFor('google', n, { aud: [CLIENT_IDS.google, 'other'] }))],
    ['another issuer', (n) => signToken(claimsFor('google', n, { iss: 'https://evil.test' }))],
    ['expired', (n) => signToken(claimsFor('google', n, { exp: nowS() - 3600 }))],
    ['no expiry', (n) => signToken(claimsFor('google', n, { exp: undefined }))],
    ['not valid yet', (n) => signToken(claimsFor('google', n, { nbf: nowS() + 3600 }))],
    ['no subject', (n) => signToken(claimsFor('google', n, { sub: '' }))],
    ['signed by another key', (n) => signToken(claimsFor('google', n), undefined, otherKey)],
    ['an unknown key id', (n) => signToken(claimsFor('google', n), { alg: 'RS256', kid: 'other' })],
    ['alg none', (n) => `${segment({ alg: 'none', kid: KID })}.${segment(claimsFor('google', n))}.`],
    [
      'HS256 keyed with the public key',
      (n) => {
        const input = `${segment({ alg: 'HS256', kid: KID })}.${segment(claimsFor('google', n))}`;
        const secret = PROVIDER_PUBLIC.export({ format: 'pem', type: 'spki' });
        return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
      },
    ],
    [
      'a changed payload',
      (n) => {
        const [h, , s] = signToken(claimsFor('google', n)).split('.');
        return `${h}.${segment(claimsFor('google', n, { sub: 'someone-else' }))}.${s}`;
      },
    ],
    ['not a token at all', () => 'not.a.token'],
  ];
  for (const [label, token] of cases) {
    const outcome = await signIn('google', {}, { token });
    assert.deepEqual(outcome, { ok: false, error: 'fallo', returnTo: '/enviar' }, label);
  }
  assert.equal(await countRows('customers'), 0);
  assert.equal(await countRows('customer_identities'), 0);
});

test('the answer must come back to the browser that left, with its own state', async () => {
  const cases: [string, Parameters<typeof signIn>[2], string][] = [
    ['another state', { params: { state: 'guessed-state-value-guessed-state-value' } }, 'caducado'],
    ['no cookie', { cookie: () => undefined }, 'caducado'],
    ['a cookie from another sign-in', { cookie: () => startSignIn('google', '/cuenta').cookieValue }, 'caducado'],
    ['a cookie for another provider', { cookie: () => startSignIn('microsoft', '/cuenta').cookieValue }, 'caducado'],
    ['no code', { params: { code: '' } }, 'fallo'],
    ['cancelled on the provider page', { params: { error: 'access_denied' } }, 'cancelado'],
  ];
  for (const [label, options, error] of cases) {
    const outcome = await signIn('google', { email: 'a@b.es', email_verified: true }, options);
    assert.equal(outcome.ok, false, label);
    assert.equal(!outcome.ok && outcome.error, error, label);
  }
  assert.equal(fake.tokenRequests.length, 0, 'no code was ever exchanged');
  assert.equal(await countRows('customers'), 0);

  fake.tokenStatus = 400;
  assert.deepEqual(await signIn('google'), { ok: false, error: 'fallo', returnTo: '/enviar' }, 'the provider refused the code');
});

test('one account per vouched-for address: Google and Apple join, Microsoft never does', async () => {
  const google = await signIn('google', { email: 'pablo@startup.es', email_verified: true, sub: 'g-1' });
  // Apple says "true" as a string, and the address may come in another case.
  const apple = await signIn('apple', { email: 'PABLO@startup.es', email_verified: 'true', sub: 'a-1' });
  assert.ok(google.ok && apple.ok);
  assert.equal(apple.customerId, google.customerId);

  // Microsoft lets a directory admin set any address: it gets its own account.
  const microsoft = await signIn('microsoft', { email: 'pablo@startup.es', sub: 'm-1' });
  assert.ok(microsoft.ok);
  assert.notEqual(microsoft.customerId, google.customerId);
  assert.equal((await getCustomer(microsoft.customerId))!.emailVerified, false);

  // Nor does an address the provider itself has not checked.
  const unverified = await signIn('google', { email: 'pablo@startup.es', email_verified: false, sub: 'g-2' });
  assert.ok(unverified.ok);
  assert.notEqual(unverified.customerId, google.customerId);

  assert.equal(await countRows('customer_identities', 'where customer_id = $1', [google.customerId]), 2);
});

test('an account first made by Microsoft is never joined later by its address', async () => {
  const microsoft = await signIn('microsoft', { email: 'lucia@empresa.es', sub: 'm-7', name: 'Lucía' });
  const google = await signIn('google', { email: 'lucia@empresa.es', email_verified: true, sub: 'g-7' });
  assert.ok(microsoft.ok && google.ok);
  assert.notEqual(google.customerId, microsoft.customerId);
});

test('Microsoft: the issuer has to name the directory the token comes from', async () => {
  const otherTenant = '72f988bf-86f1-41af-91ab-2d7cd011db47';
  const mismatch = await signIn('microsoft', { iss: `https://login.microsoftonline.com/${otherTenant}/v2.0` });
  assert.equal(mismatch.ok, false);
  const notMicrosoft = await signIn('microsoft', { iss: `https://evil.test/${PERSONAL_TENANT}/v2.0` });
  assert.equal(notMicrosoft.ok, false);
  const work = await signIn('microsoft', { iss: `https://login.microsoftonline.com/${otherTenant}/v2.0`, tid: otherTenant });
  assert.equal(work.ok, true);
});

test('Apple: a fresh ES256 client secret, no PKCE, and the name from its form, once', async () => {
  const outcome = await signIn(
    'apple',
    { email: 'x7k2@privaterelay.appleid.com', email_verified: 'true', is_private_email: 'true' },
    { params: { user: JSON.stringify({ name: { firstName: 'Ana', lastName: 'García' }, email: 'other@evil.test' }) } },
  );
  assert.ok(outcome.ok);
  const customer = (await getCustomer(outcome.customerId))!;
  assert.equal(customer.name, 'Ana García');
  assert.equal(customer.email, 'x7k2@privaterelay.appleid.com', 'the address comes from the signed token, not the form');

  const request = fake.tokenRequests[0]!;
  assert.equal(request.body.get('code_verifier'), null);
  const secret = decodeJwt(request.body.get('client_secret')!)!;
  assert.deepEqual(secret.header, { kid: process.env.APPLE_KEY_ID, typ: 'JWT', alg: 'ES256' });
  assert.equal(secret.payload.iss, process.env.APPLE_TEAM_ID);
  assert.equal(secret.payload.sub, process.env.APPLE_CLIENT_ID);
  assert.equal(secret.payload.aud, 'https://appleid.apple.com');
  assert.equal(Number(secret.payload.exp) - Number(secret.payload.iat), 300);
  assert.equal(secret.signature.length, 64, 'raw r‖s, as JWS wants, not DER');
  const applePublic = createPublicKey(createPrivateKey(process.env.APPLE_PRIVATE_KEY!));
  assert.equal(verify('sha256', Buffer.from(secret.signingInput), { key: applePublic, dsaEncoding: 'ieee-p1363' }, secret.signature), true);
  assert.notEqual(appleClientSecret(Date.now() + 1000), appleClientSecret(Date.now()));

  assert.equal(appleNameFromForm('{"name":{"firstName":"  Bea "}}'), 'Bea');
  assert.equal(appleNameFromForm('{"name":{}}'), null);
  assert.equal(appleNameFromForm('not json'), null);
  assert.equal(appleNameFromForm(null), null);
});

// ---------------------------------------------------------------------------
// The account: sessions, orders, details, deletion, the sweep
// ---------------------------------------------------------------------------

test('customer sessions: found by their hash only, and dead once expired or revoked', async () => {
  const outcome = await signIn('google', { email: 'eva@empresa.es', email_verified: true });
  assert.ok(outcome.ok);
  const token = 'a-customer-session-token-with-enough-entropy-0001';
  await insertCustomerSession({ customerId: outcome.customerId, tokenHash: hashToken(token), ipHash: null, userAgent: null, ttlSeconds: 3600 });
  assert.equal((await findCustomerSession(hashToken(token)))?.customer.email, 'eva@empresa.es');
  assert.equal(await findCustomerSession(token), null, 'the raw token is never what is stored');

  await sqlRun(`update customer_sessions set expires_at = now() - interval '1 second'`);
  assert.equal(await findCustomerSession(hashToken(token)), null, 'expired');
  await sqlRun(`update customer_sessions set expires_at = now() + interval '1 hour'`);
  await revokeCustomerSession(hashToken(token));
  assert.equal(await findCustomerSession(hashToken(token)), null, 'revoked');

  assert.equal(await countRows('sessions'), 0, "a customer's session is never one of the team's");
  assert.notEqual(customerCsrfToken(token), customerCsrfToken(`${token}x`));
  assert.equal(customerCsrfToken(token), customerCsrfToken(token));
});

function aWeekday(): string {
  let day = addDays(madridToday(), 3);
  while (weekday(day) === 0 || weekday(day) === 6) day = addDays(day, 1);
  return day;
}

async function placeAnOrder(customerId: number | null, extra: Record<string, unknown> = {}) {
  const cakeId = (await listCakes()).find((c) => c.name === 'Lotus')!.id;
  const placed = await placeOrder(
    orderInputSchema.parse({
      cakeId,
      size: 'mediana',
      occasion: 'cliente',
      recipientName: 'Marta',
      addressKind: 'oficina',
      address: 'Av. Maisonnave 11',
      postalCode: '03003',
      deliverOn: aWeekday(),
      timeSlot: 'tarde',
      senderName: 'Pablo Ruiz',
      senderPhone: '600123456',
      senderEmail: 'pablo@startup.es',
      senderCompany: 'Startup SL',
      recipientConsent: true,
      elapsedMs: 30_000,
      ...extra,
    }),
    `192.0.2.${Math.floor(Math.random() * 200) + 1}`,
    { customerId },
  );
  assert.ok(placed.ok);
  return placed.publicId;
}

test('an order placed while signed in goes in the account and keeps its details for next time', async () => {
  const outcome = await signIn('google', { email: 'pablo@startup.es', email_verified: true });
  assert.ok(outcome.ok);
  const publicId = await placeAnOrder(outcome.customerId, {
    wantsInvoice: true,
    billingName: 'Startup SL',
    billingTaxId: 'B12345674',
    billingAddress: 'Calle Mayor 1',
    billingPostalCode: '03001',
    billingCity: 'Alicante',
  });
  const orders = await listCustomerOrders(outcome.customerId);
  assert.deepEqual(orders.map((o) => o.publicId), [publicId]);
  assert.equal(orders[0]!.recipientName, 'Marta');

  const customer = (await getCustomer(outcome.customerId))!;
  assert.deepEqual([customer.name, customer.phone, customer.company], ['Pablo Ruiz', '600123456', 'Startup SL']);
  assert.deepEqual(await getCustomerBilling(outcome.customerId), {
    name: 'Startup SL',
    taxId: 'B12345674',
    address: 'Calle Mayor 1',
    postalCode: '03001',
    city: 'Alicante',
  });

  // A guest's order touches no account.
  await placeAnOrder(null);
  assert.equal(await countRows('orders', 'where customer_id is null'), 1);
});

test('deleting an account keeps its orders, unlinked; the sweep deletes accounts unused for two years', async () => {
  const kept = await signIn('google', { email: 'activa@empresa.es', email_verified: true, sub: 'g-active' });
  const gone = await signIn('apple', { email: 'vieja@empresa.es', email_verified: 'true', sub: 'a-old' });
  assert.ok(kept.ok && gone.ok);
  const publicId = await placeAnOrder(gone.customerId);
  await insertCustomerSession({ customerId: gone.customerId, tokenHash: hashToken('old-session-token-0002'), ipHash: null, userAgent: null, ttlSeconds: 3600 });

  await sqlRun(`update customers set last_seen_at = now() - make_interval(days => $1) where id = $2`, [RETENTION_DAYS.customerAccounts + 1, gone.customerId]);
  const run = await runRetention();
  assert.equal(run.customerAccounts, 1);
  assert.equal(await getCustomer(gone.customerId), null);
  assert.ok(await getCustomer(kept.customerId), 'an account in use stays');
  assert.equal(await countRows('customer_identities', 'where customer_id = $1', [gone.customerId]), 0);
  assert.equal(await countRows('customer_sessions'), 0);
  const order = await sqlOne<{ customer_id: number | null }>('select customer_id from orders where public_id = $1', [publicId]);
  assert.equal(order?.customer_id, null, 'the order stays, without the account');

  assert.equal(await deleteCustomer(kept.customerId), true);
  assert.equal(await countRows('customers'), 0);
  assert.equal(await customerAccountsReady(), true);
});

test('saved details are parsed like the order form: the NIF by its control letter, invoice data only when asked for', () => {
  const plain = accountDetailsSchema.parse({ name: '  Pablo   Ruiz ', phone: '', company: '', wantsInvoice: null });
  assert.deepEqual(plain, { name: 'Pablo Ruiz', phone: null, company: null, billing: null });

  const badNif = accountDetailsSchema.safeParse({
    name: 'Pablo',
    wantsInvoice: 'on',
    billingName: 'Startup SL',
    billingTaxId: 'B12345678',
    billingAddress: 'Calle Mayor 1',
    billingPostalCode: '03001',
    billingCity: 'Alicante',
  });
  assert.equal(badNif.success, false);
  assert.deepEqual(badNif.error?.issues.map((i) => i.path[0]), ['billingTaxId']);

  const good = accountDetailsSchema.parse({
    name: 'Pablo',
    wantsInvoice: 'on',
    billingName: 'Startup SL',
    billingTaxId: 'b-12.345.674',
    billingAddress: 'Calle Mayor 1',
    billingPostalCode: '03001',
    billingCity: 'Alicante',
  });
  assert.equal(good.billing?.taxId, 'B12345674');
  assert.equal(accountDetailsSchema.safeParse({ name: '' }).success, false);
});
