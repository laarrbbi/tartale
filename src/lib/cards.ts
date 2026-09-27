/**
 * The card that goes with the cake. Nothing is printed on the cake itself
 * (yet): the card is where the sender's words go, in one of three designs,
 * printed at A6 and tucked into the box. Pure data, safe in the browser.
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
 */
export const ORDER_DOCUMENT = {
  maxBytes: 3_000_000,
  types: ['application/pdf', 'image/jpeg', 'image/png'] as const,
  accept: 'application/pdf,image/jpeg,image/png',
} as const;
