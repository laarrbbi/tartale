/**
 * Who runs Tartale. One file, so the name and the legal details are changed in
 * one place.
 *
 * The legal details are required by Spanish law on the site (LSSI art. 10,
 * RGPD art. 13): the company or trader's name, NIF, address and a contact
 * email. They are not known yet, so they are marked as pending and the legal
 * pages say so plainly. Fill them in before launch.
 */
export const BRAND = {
  name: 'Tartale',
  tagline: 'Un email se ignora. Una tarta, no.',
  domain: 'tartale.vercel.app',
} as const;

export const LEGAL = {
  /** Razón social, e.g. "Ejemplo, S.L." */
  name: null as string | null,
  nif: null as string | null,
  address: null as string | null,
  /** Where people write about their data and about the site. */
  email: null as string | null,
  /** Registro Mercantil entry, when it is a company. */
  registry: null as string | null,
};

/** True once every detail the law asks for is filled in. */
export const LEGAL_COMPLETE = Boolean(LEGAL.name && LEGAL.nif && LEGAL.address && LEGAL.email);

/** What the legal pages print in place of a missing detail. */
export const PENDING = '[pendiente]';
