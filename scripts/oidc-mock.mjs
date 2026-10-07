#!/usr/bin/env node
/**
 * A stand-in for Google, Apple and Microsoft sign-in, for trying accounts on a
 * development machine without registering the app anywhere.
 *
 *   node scripts/oidc-mock.mjs            (listens on http://localhost:3310)
 *
 * then run the app with `next dev` and
 *   OIDC_MOCK_ORIGIN=http://localhost:3310
 *   GOOGLE_CLIENT_ID=dev GOOGLE_CLIENT_SECRET=dev
 *   MICROSOFT_CLIENT_ID=dev MICROSOFT_CLIENT_SECRET=dev
 *   APPLE_CLIENT_ID=dev APPLE_TEAM_ID=dev APPLE_KEY_ID=dev APPLE_PRIVATE_KEY=<any P-256 key, PEM>
 *
 * Each provider's page asks who you are, then sends you back the way the
 * real one does: Google and Microsoft with a redirect, Apple with a form POST
 * that carries the name once. Its token endpoint checks the code, the
 * redirect URI and the PKCE verifier, and answers with an RS256 ID token
 * carrying the real providers' issuers. A production build never talks to it
 * (see src/server/auth/oidc.ts).
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 3310);
const PERSONAL_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';
const ISSUERS = {
  google: 'https://accounts.google.com',
  apple: 'https://appleid.apple.com',
  microsoft: `https://login.microsoftonline.com/${PERSONAL_TENANT}/v2.0`,
};
const LABELS = { google: 'Google', apple: 'Apple', microsoft: 'Microsoft' };

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = `mock-${randomBytes(4).toString('hex')}`;
/** code → what the app asked for, and who said yes. */
const codes = new Map();

const segment = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function idToken(claims) {
  const input = `${segment({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${segment(claims)}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title>
<style>body{font:16px system-ui;max-width:26rem;margin:3rem auto;padding:0 1rem}label{display:block;margin:.8rem 0 .2rem}input{width:100%;padding:.5rem;font:inherit}button{margin-top:1.2rem;padding:.6rem 1.2rem;font:inherit}</style>
${body}`;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const [, provider, action] = url.pathname.split('/');
  if (!ISSUERS[provider]) return send(res, 404, 'text/plain', 'unknown provider');

  if (action === 'jwks') {
    return send(res, 200, 'application/json', JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' }] }));
  }

  if (action === 'authorize') {
    // Who are you? Prefilled, so a script can just press the button.
    const q = url.searchParams;
    const hidden = ['client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge', 'response_mode']
      .map((k) => `<input type="hidden" name="${k}" value="${escape(q.get(k) ?? '')}">`)
      .join('');
    return send(
      res,
      200,
      'text/html; charset=utf-8',
      page(
        `${LABELS[provider]} (mock)`,
        `<h1>${LABELS[provider]} · prueba</h1><form method="post" action="/${provider}/approve">${hidden}
<label for="email">Email</label><input id="email" name="email" value="ana@empresa.es">
<label for="name">Nombre</label><input id="name" name="name" value="Ana Pérez">
<label for="sub">Identificador</label><input id="sub" name="sub" value="${provider}-ana">
<button type="submit">Continuar</button> <button type="submit" name="cancel" value="1">Cancelar</button></form>`,
      ),
    );
  }

  if (action === 'approve' && req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req));
    const back = new URL(form.get('redirect_uri'));
    const answer = new URLSearchParams({ state: form.get('state') ?? '' });
    if (form.get('cancel')) {
      answer.set('error', provider === 'apple' ? 'user_cancelled_authorize' : 'access_denied');
    } else {
      const code = randomBytes(24).toString('base64url');
      codes.set(code, { provider, form, at: Date.now() });
      answer.set('code', code);
      if (provider === 'apple') {
        const [firstName, ...rest] = (form.get('name') ?? '').split(' ');
        answer.set('user', JSON.stringify({ name: { firstName, lastName: rest.join(' ') }, email: form.get('email') }));
      }
    }
    if (form.get('response_mode') === 'form_post') {
      const fields = [...answer].map(([k, v]) => `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`).join('');
      return send(
        res,
        200,
        'text/html; charset=utf-8',
        page('Apple', `<form id="f" method="post" action="${escape(back)}">${fields}</form><script>document.getElementById('f').submit()</script>`),
      );
    }
    for (const [k, v] of answer) back.searchParams.set(k, v);
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }

  if (action === 'token' && req.method === 'POST') {
    const body = new URLSearchParams(await readBody(req));
    const grant = codes.get(body.get('code') ?? '');
    codes.delete(body.get('code') ?? '');
    const fail = (error) => send(res, 400, 'application/json', JSON.stringify({ error }));
    if (!grant || grant.provider !== provider || Date.now() - grant.at > 60_000) return fail('invalid_grant');
    if (body.get('redirect_uri') !== grant.form.get('redirect_uri')) return fail('invalid_grant');
    if (body.get('client_id') !== grant.form.get('client_id') || !body.get('client_secret')) return fail('invalid_client');
    const challenge = grant.form.get('code_challenge');
    if (challenge && createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url') !== challenge) return fail('invalid_grant');
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: ISSUERS[provider],
      aud: grant.form.get('client_id'),
      sub: grant.form.get('sub'),
      iat: now,
      exp: now + 600,
      nonce: grant.form.get('nonce'),
      email: grant.form.get('email'),
      // Apple says it as a string; Microsoft does not say it at all.
      ...(provider === 'google' ? { email_verified: true, name: grant.form.get('name') } : {}),
      ...(provider === 'apple' ? { email_verified: 'true' } : {}),
      ...(provider === 'microsoft' ? { tid: PERSONAL_TENANT, name: grant.form.get('name') } : {}),
    };
    return send(res, 200, 'application/json', JSON.stringify({ id_token: idToken(claims), access_token: 'mock', token_type: 'Bearer' }));
  }

  send(res, 404, 'text/plain', 'not found');
}).listen(PORT, () => console.log(`oidc mock on http://localhost:${PORT}`));
