/**
 * Who runs Tartame: the name and the tagline, in one place.
 *
 * The legal details the law asks for on the site (LSSI art. 10, RGPD art.
 * 13) and on every invoice — the company's name, NIF, address and a contact
 * email — are not here: the owner fills them in from the panel (Ajustes), and
 * the legal pages read them from the database. Until then those pages mark
 * them as pending.
 */
export const BRAND = {
  name: 'Tartame',
  tagline: 'Un email se ignora. Una tarta, no.',
  domain: 'tartame.vercel.app',
} as const;

/** What the legal pages print in place of a missing detail. */
export const PENDING = '[pendiente]';
