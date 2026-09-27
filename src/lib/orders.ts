/**
 * The order, as a domain: what can be chosen, what it is called, and how it
 * moves. Pure data and functions, safe on the client and the server.
 */

export const OCCASIONS = {
  networking: { label: 'Networking', card: 'Un email se ignora. Una tarta, no. ¿Tomamos un café?' },
  inversor: { label: 'Un inversor', card: 'Nos encantaría contarte lo que estamos construyendo.' },
  socio: { label: 'Un futuro socio', card: 'Por todo lo que podemos hacer juntos.' },
  reclutador: { label: 'Un reclutador', card: 'Una forma dulce de presentarme.' },
  cliente: { label: 'Un cliente', card: 'Gracias por confiar en nosotros.' },
  cumpleanos: { label: 'Un cumpleaños', card: '¡Feliz cumpleaños!' },
  equipo: { label: 'Alguien del equipo', card: 'Gracias por todo lo que haces.' },
  otro: { label: 'Otra cosa', card: '' },
} as const;
export type Occasion = keyof typeof OCCASIONS;
export const OCCASION_IDS = Object.keys(OCCASIONS) as Occasion[];

export const SIZES = {
  pequena: { label: 'Pequeña' },
  mediana: { label: 'Mediana' },
  grande: { label: 'Grande' },
} as const;
export type CakeSize = keyof typeof SIZES;
export const SIZE_IDS = Object.keys(SIZES) as CakeSize[];

export const SLOTS = {
  manana: { label: 'Por la mañana', hours: '9:00–13:00' },
  tarde: { label: 'Por la tarde', hours: '16:00–20:00' },
} as const;
export type TimeSlot = keyof typeof SLOTS;
export const SLOT_IDS = Object.keys(SLOTS) as TimeSlot[];

export const ADDRESS_KINDS = {
  oficina: 'Oficina',
  casa: 'Casa',
} as const;
export type AddressKind = keyof typeof ADDRESS_KINDS;

/** The life of an order, in the order it happens. `customer` is what the sender sees. */
export const STATUSES = {
  nuevo: { label: 'Nuevo', customer: 'Recibido', tone: 'caution' },
  confirmado: { label: 'Confirmado', customer: 'Confirmado', tone: 'brand' },
  en_horno: { label: 'En el horno', customer: 'En el horno', tone: 'brand' },
  en_camino: { label: 'De camino', customer: 'De camino', tone: 'brand' },
  entregado: { label: 'Entregado', customer: 'Entregado', tone: 'positive' },
  cancelado: { label: 'Cancelado', customer: 'Cancelado', tone: 'critical' },
} as const;
export type OrderStatus = keyof typeof STATUSES;
export const STATUS_IDS = Object.keys(STATUSES) as OrderStatus[];
export const STATUS_FLOW: OrderStatus[] = ['nuevo', 'confirmado', 'en_horno', 'en_camino', 'entregado'];

/** A cancelled order with no money in or out can go entirely: a test, or one made by mistake. */
export function canDeleteOrder(order: { status: OrderStatus; paidCents: number; refundedCents: number }): boolean {
  return order.status === 'cancelado' && order.paidCents === 0 && order.refundedCents === 0;
}

export function nextStatus(status: OrderStatus): OrderStatus | null {
  const i = STATUS_FLOW.indexOf(status);
  return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1]! : null;
}

/**
 * How the order is paid. Web orders pay by card on Stripe when they are
 * placed; orders the team creates (company birthdays) are invoiced and paid by
 * transfer.
 */
export const PAYMENT_METHODS = {
  stripe: 'Tarjeta (Stripe)',
  transferencia: 'Transferencia',
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export const PAYMENT_STATUSES = {
  pendiente: { label: 'Sin pagar', tone: 'caution' },
  pagado: { label: 'Pagado', tone: 'positive' },
  parcial: { label: 'Devuelto en parte', tone: 'caution' },
  reembolsado: { label: 'Devuelto', tone: 'neutral' },
  caducado: { label: 'Pago abandonado', tone: 'neutral' },
} as const;
export type PaymentStatus = keyof typeof PAYMENT_STATUSES;

export const ORDER_SOURCES = {
  web: 'Web',
  cumpleanos: 'Cumpleaños automático',
  panel: 'Panel',
} as const;
export type OrderSource = keyof typeof ORDER_SOURCES;

export const ORDER_LIMITS = {
  cardMessage: 300,
  signOff: 60,
  notes: 300,
  address: 200,
  name: 80,
  company: 80,
  email: 200,
  phone: 24,
} as const;


/** Money is integer cents everywhere; this is the only way it becomes text. */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Cents as the panel's inputs show them, the way they are typed in Spain: 2900 → "29", 4250 → "42,50". */
export function eurosInput(cents: number | null): string {
  if (cents === null) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',');
}

/** Cake prices by size; null where the bakery does not make that size. */
export type SizePrices = Record<CakeSize, number | null>;

export function priceFor(prices: SizePrices, size: CakeSize): number | null {
  const cents = prices[size];
  return typeof cents === 'number' && Number.isInteger(cents) && cents >= 0 ? cents : null;
}

/** The cheapest size of a cake, for "desde 29 €". */
export function fromPrice(prices: SizePrices): number | null {
  const all = SIZE_IDS.map((s) => priceFor(prices, s)).filter((c): c is number => c !== null);
  return all.length ? Math.min(...all) : null;
}

/** The text on the card, as it will be printed: the sender's line, or nothing if anonymous. */
export function signOffFor(input: { anonymous: boolean; signOff: string | null; senderName: string | null }): string | null {
  if (input.anonymous) return null;
  return input.signOff ?? input.senderName ?? null;
}
