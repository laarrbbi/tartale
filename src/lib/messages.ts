import { CARD_DESIGNS, type CardDesign } from './cards';
import { longDate } from './dates';
import { SIZES, SLOTS, formatEuros } from './orders';

/**
 * The texts the team sends by WhatsApp, prefilled. Kept in one place so the
 * wording is reviewed once, and tested.
 */
export interface MessageOrder {
  id: number;
  cakeName: string;
  size: keyof typeof SIZES;
  cardDesign: CardDesign;
  hasDocument: boolean;
  allergies: string | null;
  cardMessage: string | null;
  signOff: string | null;
  recipientName: string | null;
  recipientCompany: string | null;
  recipientPhone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string;
  deliveryNotes: string | null;
  deliverOn: string;
  timeSlot: keyof typeof SLOTS;
  senderName: string | null;
  totalCents: number;
  paymentMethod: 'stripe' | 'transferencia';
  paymentStatus: string;
}

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] ?? '';
}

/** To whoever sent it: the confirmation, with the tracking link. Never to the recipient. */
export function senderConfirmation(order: MessageOrder, trackingUrl: string): string {
  const paid =
    order.paymentMethod === 'stripe'
      ? `Pagado: ${formatEuros(order.totalCents)}.`
      : `Importe: ${formatEuros(order.totalCents)}, por transferencia.`;
  return [
    `Hola ${firstName(order.senderName)}, te escribimos de Tartale.`,
    `Confirmamos tu pedido nº ${order.id}: tarta ${order.cakeName} (${SIZES[order.size].label.toLowerCase()}) para ${order.recipientName ?? ''},` +
      ` el ${longDate(order.deliverOn)}, ${SLOTS[order.timeSlot].label.toLowerCase()} (${SLOTS[order.timeSlot].hours}).`,
    paid,
    `Aquí puedes ver cómo va: ${trackingUrl}`,
  ].join(' ');
}

/**
 * To the bakery: everything it needs to bake and deliver. Nothing is written
 * on the cake; the card (and a document, if there is one) go in the box.
 */
export function bakeryBrief(order: MessageOrder): string {
  const lines = [
    `Pedido Tartale nº ${order.id} · ${longDate(order.deliverOn)}, ${SLOTS[order.timeSlot].label.toLowerCase()} (${SLOTS[order.timeSlot].hours})`,
    `Tarta: ${order.cakeName}, ${SIZES[order.size].label.toLowerCase()}. Sin nada escrito encima.`,
  ];
  if (order.allergies) lines.push(`Alergias: ${order.allergies}`);
  lines.push(
    `En la caja: la tarjeta impresa (diseño ${CARD_DESIGNS[order.cardDesign].label.toLowerCase()})` +
      (order.hasDocument ? ' y un documento impreso.' : '.'),
  );
  lines.push(`Tarjeta: ${order.cardMessage ? `«${order.cardMessage}»` : '(sin mensaje)'} — ${order.signOff ?? 'anónima'}`);
  lines.push(
    `Entregar a: ${order.recipientName ?? ''}${order.recipientCompany ? ` (${order.recipientCompany})` : ''}, ${order.address ?? ''}, ${order.postalCode ?? ''} ${order.city}` +
      (order.deliveryNotes ? ` · ${order.deliveryNotes}` : ''),
  );
  if (order.recipientPhone) lines.push(`Teléfono para la entrega: ${order.recipientPhone}`);
  return lines.join('\n');
}

export function mapsLink(order: Pick<MessageOrder, 'address' | 'postalCode' | 'city'>): string | null {
  if (!order.address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.address}, ${order.postalCode ?? ''} ${order.city}`)}`;
}
