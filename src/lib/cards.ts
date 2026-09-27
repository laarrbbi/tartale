/**
 * The card that goes in the box with the cake: the sender's longer words, in
 * one of three designs, printed at A6. (The cake itself carries the photo and
 * a short line, printed on top.) Pure data, safe in the browser.
 */
export const CARD_DESIGNS = {
  clasica: { label: 'Clásica', hint: 'Crema, letra de imprenta' },
  mano: { label: 'A mano', hint: 'Papel kraft, letra manuscrita' },
  color: { label: 'Color', hint: 'Frambuesa, letra grande' },
} as const;
export type CardDesign = keyof typeof CARD_DESIGNS;
export const CARD_DESIGN_IDS = Object.keys(CARD_DESIGNS) as CardDesign[];

/**
 * How big the message is set, as a share of the card's width (cqw), so a
 * short line fills the card and 300 characters still fit. Each design's type
 * runs at a different size, hence the per-design base.
 */
export function messageSize(design: CardDesign, message: string): number {
  const length = message.length + (message.match(/\n/g)?.length ?? 0) * 18;
  const [max, min] = design === 'mano' ? [11, 5.6] : design === 'color' ? [9.2, 4.4] : [8.2, 4.2];
  if (length <= 40) return max;
  // Down gently at first, then flatter: a long note gets smaller, not tiny.
  const size = max - Math.sqrt(length - 40) * ((max - min) / Math.sqrt(260));
  return Math.max(min, Math.round(size * 10) / 10);
}

/**
 * The document the sender can add — a CV, a proposal, a one-pager — printed
 * and put in the box with the cake. Checked by its first bytes on the server.
 * 2 MB, so that with the cake's photo (1 MB at most) the order still fits in
 * one request.
 */
export const ORDER_DOCUMENT = {
  maxBytes: 2_000_000,
  types: ['application/pdf', 'image/jpeg', 'image/png'] as const,
  accept: 'application/pdf,image/jpeg,image/png',
} as const;
