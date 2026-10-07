import { generateKeyPairSync } from 'node:crypto';

/**
 * Loaded with `node --import` before any test file. `src/lib/env` parses at
 * import time, so the environment has to exist first. Node also runs with
 * `--conditions=react-server` so `server-only` resolves to its empty stub.
 */
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-ok';
process.env.IP_HASH_SECRET = 'test-ip-hash-secret-that-is-long-enough-ok';
process.env.APP_ORIGIN = 'https://tartame.test';
// Never read: getDb() returns the PGlite handle in tests.
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:5432/unused';
process.env.CRON_SECRET = 'test-cron-secret-that-is-long-enough-to-use';
process.env.STRIPE_SECRET_KEY = 'sk_test_tartame_unit_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_tartame_unit_tests';
// Sign-in, against the fake providers in tests/accounts.test.ts. Apple's key
// is made fresh for each run: a real one never appears in the repository.
process.env.GOOGLE_CLIENT_ID = 'tartame-test.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'google-test-secret';
process.env.APPLE_CLIENT_ID = 'test.tartame.web';
process.env.APPLE_TEAM_ID = 'TEAM123456';
process.env.APPLE_KEY_ID = 'KEY1234567';
process.env.APPLE_PRIVATE_KEY = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  .privateKey.export({ format: 'pem', type: 'pkcs8' })
  .toString();
process.env.MICROSOFT_CLIENT_ID = '00000000-0000-4000-8000-00000000c0de';
process.env.MICROSOFT_CLIENT_SECRET = 'microsoft-test-secret';
