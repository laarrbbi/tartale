/**
 * What went wrong reaching the database, in one word that is safe to show.
 *
 * A thrown connection error becomes a bare "Internal Server Error" in
 * production, which is the least useful thing a page can say: it looks
 * identical whether the hostname is wrong, the password is wrong, or the
 * database is simply asleep. Whoever is setting the site up then has nothing
 * to act on, and the host's log viewer is the only way to find out — assuming
 * they know where it is.
 *
 * The token below is deliberately coarse. It names the *class* of problem so
 * the setup page can say what to fix, and carries no hostname, user, port or
 * driver text, because that page is public.
 */
export type DbFailure =
  | 'host-not-found'
  | 'unreachable'
  | 'timeout'
  | 'tls'
  | 'auth'
  | 'no-database'
  | 'schema'
  | 'unknown';

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
}

/** Postgres SQLSTATEs worth telling apart. */
const SQLSTATE: Record<string, DbFailure> = {
  '28P01': 'auth', // invalid_password
  '28000': 'auth', // invalid_authorization_specification
  '3D000': 'no-database', // invalid_catalog_name
  // Reached the database, but it is not shaped the way this build expects:
  // a migration that was never applied, or a table created by hand.
  '42P01': 'schema', // undefined_table
  '42703': 'schema', // undefined_column
  '42704': 'schema', // undefined_object (an enum type, for instance)
  '22P02': 'schema', // invalid_text_representation (an enum value it lacks)
};

/** Node socket/DNS errnos. */
const ERRNO: Record<string, DbFailure> = {
  ENOTFOUND: 'host-not-found',
  EAI_AGAIN: 'host-not-found',
  ECONNREFUSED: 'unreachable',
  EHOSTUNREACH: 'unreachable',
  ENETUNREACH: 'unreachable',
  ECONNRESET: 'unreachable',
  ETIMEDOUT: 'timeout',
};

export function classifyDbError(error: unknown): DbFailure {
  // node-postgres wraps the socket error, so the useful code is often one
  // level down in `cause` rather than on the error itself.
  const chain: ErrorLike[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    chain.push(current as ErrorLike);
    current = (current as ErrorLike).cause;
  }

  for (const link of chain) {
    const code = typeof link.code === 'string' ? link.code : undefined;
    if (code) {
      if (SQLSTATE[code]) return SQLSTATE[code];
      if (ERRNO[code]) return ERRNO[code];
      if (code.startsWith('ERR_TLS') || code.includes('CERT')) return 'tls';
    }
  }

  const text = chain
    .map((link) => (typeof link.message === 'string' ? link.message : ''))
    .join(' ')
    .toLowerCase();

  // `pg` reports its own connection timeout as a plain message with no code.
  if (text.includes('timeout')) return 'timeout';
  if (text.includes('self-signed') || text.includes('certificate')) return 'tls';
  if (text.includes('password authentication failed')) return 'auth';
  if (text.includes('ssl') || text.includes('pg_hba')) return 'tls';

  return 'unknown';
}

/** What to do about it, for the person setting the site up. */
export const DB_FAILURE_HINT: Record<DbFailure, string> = {
  'host-not-found':
    'El servidor de la base de datos no existe. Revisa el nombre del host en DATABASE_URL — cópialo del panel de Supabase, en «Connection string → Transaction pooler».',
  unreachable:
    'La base de datos rechazó la conexión. Comprueba que usas el puerto 6543 (Transaction pooler) y no el 5432.',
  timeout:
    'La base de datos no respondió a tiempo. Suele ser un host o un puerto equivocado en DATABASE_URL, o el proyecto de Supabase en pausa.',
  tls: 'Fallo en la conexión cifrada con la base de datos.',
  auth: 'Usuario o contraseña incorrectos en DATABASE_URL. La contraseña va entre los dos puntos y la arroba.',
  'no-database': 'Esa base de datos no existe en el servidor. Debe terminar en /postgres.',
  schema:
    'La base de datos responde, pero le falta una tabla o una columna que esta versión de la web necesita. Aplica en Supabase (SQL Editor) los archivos de supabase/migrations que falten.',
  unknown: 'No se pudo conectar con la base de datos.',
};

/**
 * The Postgres SQLSTATE behind a failure, if there is one.
 *
 * Five characters that say exactly which kind of error it was — 42703 is
 * "no such column" — and nothing about the data, the host or the query, so
 * it is safe to print on a public page next to the failure class.
 */
export function dbErrorCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const code = (current as ErrorLike).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as ErrorLike).cause;
  }
  return null;
}
