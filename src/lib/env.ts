import { z } from 'zod';

/**
 * Environment contract, parsed once at module load. A misconfigured deployment
 * fails with a readable message instead of silently degrading a security
 * control at request time (an empty SESSION_SECRET signing every cookie with "").
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  APP_ORIGIN: z
    .string()
    .url()
    .refine((v) => !v.endsWith('/'), 'APP_ORIGIN must not have a trailing slash')
    .default('http://localhost:3000'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters of random data'),
  IP_HASH_SECRET: z.string().min(32, 'IP_HASH_SECRET must be at least 32 characters of random data'),

  /** Supabase's transaction pooler (port 6543), not the direct port. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required. See .env.example.'),

  TRUST_PROXY_HEADERS: z
    .enum(['0', '1'])
    .default('0')
    .transform((v) => v === '1'),

  /** Vercel sends it as a bearer token on cron calls; unset means the cron endpoints are off. */
  CRON_SECRET: z.string().default(''),

  /** `sk_test_…`/`sk_live_…` or a restricted `rk_…` key. Unset: the shop takes no orders. */
  STRIPE_SECRET_KEY: z.string().default(''),
  /** `whsec_…`, from the webhook endpoint in Stripe's dashboard. */
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  // Customer sign-in (docs/sign-in.md). Each provider is offered once all of
  // its variables are set; with none set, the site has no accounts at all.
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  /** The Services ID (com.example.web), not the App ID. */
  APPLE_CLIENT_ID: z.string().default(''),
  APPLE_TEAM_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),
  /** The .p8 file's contents, PEM, line breaks included (or written as \n). */
  APPLE_PRIVATE_KEY: z.string().default(''),
  MICROSOFT_CLIENT_ID: z.string().default(''),
  MICROSOFT_CLIENT_SECRET: z.string().default(''),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Reads a variable the way people fill a hosting dashboard in: a blank box is
 * unset, and a value pasted with its quotes from .env.example is unwrapped.
 */
function read(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  const unquoted =
    trimmed.length >= 2 &&
    (trimmed.startsWith('"') || trimmed.startsWith("'")) &&
    trimmed.endsWith(trimmed[0]!)
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted === '' ? undefined : unquoted;
}

const FLAG_ON = new Set(['1', 'true', 'yes', 'on', 'y']);
const FLAG_OFF = new Set(['0', 'false', 'no', 'off', 'n']);

/** Anything unrecognised falls back to the default, which is the cautious side. */
function flag(value: string | undefined): '0' | '1' | undefined {
  if (value === undefined) return undefined;
  const v = value.toLowerCase();
  if (FLAG_ON.has(v)) return '1';
  if (FLAG_OFF.has(v)) return '0';
  return undefined;
}

/**
 * The public origin, when the platform knows it. VERCEL_PROJECT_PRODUCTION_URL
 * is the project's production domain (the custom one once assigned). An
 * explicit APP_ORIGIN still wins. A wrong origin is not cosmetic: the
 * same-origin check would refuse every form on the site.
 */
function platformOrigin(): string | undefined {
  const host = read('VERCEL_PROJECT_PRODUCTION_URL');
  return host ? `https://${host.replace(/\/+$/, '')}` : undefined;
}

function loadEnv(): Env {
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  const raw = {
    NODE_ENV: read('NODE_ENV'),
    APP_ORIGIN: read('APP_ORIGIN') ?? platformOrigin(),
    SESSION_SECRET: read('SESSION_SECRET'),
    IP_HASH_SECRET: read('IP_HASH_SECRET'),
    DATABASE_URL: read('DATABASE_URL'),
    TRUST_PROXY_HEADERS: flag(read('TRUST_PROXY_HEADERS')),
    CRON_SECRET: read('CRON_SECRET'),
    STRIPE_SECRET_KEY: read('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: read('STRIPE_WEBHOOK_SECRET'),
    GOOGLE_CLIENT_ID: read('GOOGLE_CLIENT_ID'),
    GOOGLE_CLIENT_SECRET: read('GOOGLE_CLIENT_SECRET'),
    APPLE_CLIENT_ID: read('APPLE_CLIENT_ID'),
    APPLE_TEAM_ID: read('APPLE_TEAM_ID'),
    APPLE_KEY_ID: read('APPLE_KEY_ID'),
    APPLE_PRIVATE_KEY: read('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    MICROSOFT_CLIENT_ID: read('MICROSOFT_CLIENT_ID'),
    MICROSOFT_CLIENT_SECRET: read('MICROSOFT_CLIENT_SECRET'),
  };

  const parsed = EnvSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  // `next build` imports server modules to collect routes, without the real
  // environment. Throwaway values let it finish; a running production server
  // never gets them.
  if (isBuildPhase || process.env.NODE_ENV !== 'production') {
    return EnvSchema.parse({
      ...raw,
      SESSION_SECRET: raw.SESSION_SECRET || 'dev-only-session-secret-not-for-production-use!!',
      IP_HASH_SECRET: raw.IP_HASH_SECRET || 'dev-only-ip-hash-secret-not-for-production-use!!',
      DATABASE_URL: raw.DATABASE_URL || 'postgresql://build:build@127.0.0.1:5432/build',
    });
  }

  const describe = (issues: typeof parsed.error.issues): string =>
    issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');

  // A bad *optional* value must not take the whole site down: it falls back to
  // its default, loudly. The three secrets below have no safe default.
  const required = new Set(['SESSION_SECRET', 'IP_HASH_SECRET', 'DATABASE_URL']);
  const recoverable = parsed.error.issues.filter((i) => !required.has(String(i.path[0])));
  if (recoverable.length === parsed.error.issues.length) {
    const retry: Record<string, unknown> = { ...raw };
    for (const issue of recoverable) delete retry[String(issue.path[0])];
    const second = EnvSchema.safeParse(retry);
    if (second.success) {
      console.error(`[env] Ignoring invalid value(s), using the default:\n${describe(recoverable)}`);
      return second.data;
    }
  }

  throw new Error(`Invalid environment configuration:\n${describe(parsed.error.issues)}\n\nSee .env.example.`);
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
