/**
 * Server startup hook: creates the first owner account when the dashboard
 * asks for it (see services/bootstrap.ts). Nothing else runs at boot — in
 * particular no schema change, ever.
 *
 * Nothing here may throw: a rejection from `register` makes every request,
 * including /api/health, answer 500 before any handler runs.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    // Dynamic import inside the guard: a static one would pull `pg` into
    // bundles that cannot load it.
    const { bootstrapFirstAdmin } = await import('@/server/services/bootstrap');
    await bootstrapFirstAdmin();
  } catch (error) {
    console.error('[bootstrap] failed', error);
  }
}
