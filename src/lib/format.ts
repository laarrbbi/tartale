/** Coarse relative time for lists: "hace 5 min", "hace 3 d", then a date. */
export function formatWhen(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(then).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });
}

/** Date and time in Madrid: "14 oct, 18:02". */
export function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });
}

/** "1 tarta" / "3 tartas". */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Levadura Madre, Gran Vía" → "levadura-madre-gran-via": for slugs that must match ^[a-z0-9]+(-[a-z0-9]+)*$. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Who did it, for the activity lists: payments are logged as "stripe", jobs with no one as null. */
export function actorLabel(actorEmail: string | null): string {
  if (actorEmail === 'stripe') return 'Stripe';
  return actorEmail ?? 'sistema';
}

/** "240 KB", "1,2 MB": for file sizes shown to people. */
export function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',')} MB`;
}
