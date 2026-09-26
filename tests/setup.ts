/**
 * Loaded with `node --import` before any test file. `src/lib/env` parses at
 * import time, so the environment has to exist first. Node also runs with
 * `--conditions=react-server` so `server-only` resolves to its empty stub.
 */
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-ok';
process.env.IP_HASH_SECRET = 'test-ip-hash-secret-that-is-long-enough-ok';
process.env.APP_ORIGIN = 'https://tartale.test';
// Never read: getDb() returns the PGlite handle in tests.
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:5432/unused';
process.env.CRON_SECRET = 'test-cron-secret-that-is-long-enough-to-use';
process.env.STRIPE_SECRET_KEY = 'sk_test_tartale_unit_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_tartale_unit_tests';
