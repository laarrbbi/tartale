/**
 * Which required settings are missing or unusable — by name, never by value.
 *
 * `env.ts` throws at import when a secret is missing, so every page that needs
 * one dies before it can say why. This reads the same variables without
 * throwing, so /api/health can name the culprit. Kept apart from env.ts on
 * purpose: importing that module is exactly what fails.
 */
const MIN_SECRET_LENGTH = 32;

function read(name: string): string {
  const trimmed = (process.env[name] ?? '').trim();
  const quoted =
    trimmed.length >= 2 && (trimmed.startsWith('"') || trimmed.startsWith("'")) && trimmed.endsWith(trimmed[0]!);
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

export function configProblems(): string[] {
  const problems: string[] = [];
  for (const name of ['SESSION_SECRET', 'IP_HASH_SECRET']) {
    const value = read(name);
    if (value === '') problems.push(`${name}: falta`);
    else if (value.length < MIN_SECRET_LENGTH) problems.push(`${name}: demasiado corta (mínimo ${MIN_SECRET_LENGTH})`);
  }
  if (read('DATABASE_URL') === '') problems.push('DATABASE_URL: falta');
  return problems;
}
