'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { longDate } from '@/lib/dates';
import { ORDER_LIMITS, SLOT_IDS, STATUSES, canDeleteOrder, formatEuros, nextStatus, type OrderStatus } from '@/lib/orders';
import { recordAudit } from '@/server/repositories/audit';
import { findBakery } from '@/server/repositories/catalog';
import { orderWasRectified } from '@/server/repositories/invoices';
import {
  deleteCancelledOrder,
  eraseOrder,
  findOrderById,
  setManualPayment,
  setOrderStatus,
  updateOrderStaff,
  type Order,
} from '@/server/repositories/orders';
import { rectifyAfterChange } from '@/server/services/invoice-service';
import { refundOrder } from '@/server/services/payment-service';
import { enumOf, eurosSchema, idSchema, isoDaySchema, optionalText } from '@/server/validation/schemas';

import { beginMutation, isActionState, type Begun } from './begin';
import { fail, ok, toFieldErrors, type ActionState } from './types';

function revalidate(id: number) {
  revalidatePath('/admin');
  revalidatePath(`/admin/pedidos/${id}`);
}

const actorOf = (begun: Begun) => ({ id: begun.session.user.id, email: begun.session.user.email });

async function audit(begun: Begun, action: string, order: Pick<Order, 'id'>, detail: string | null) {
  await recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action,
    target: `order:${order.id}`,
    detail,
    ipHash: begun.ipHash,
  });
}

/** An order that still waits for its card payment is not an order yet: it cannot be worked on. */
function awaitingPayment(order: Order): boolean {
  return order.paymentMethod === 'stripe' && (order.paymentStatus === 'pendiente' || order.paymentStatus === 'caducado');
}

/**
 * One tap forward: Nuevo → Confirmado → En el horno → De camino → Entregado.
 * Only the next step is accepted, so a stale page or a double tap cannot skip
 * one or go back. Staff can do this; cancelling is the owner's.
 */
export async function advanceOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  const target = String(formData.get('status') ?? '') as OrderStatus;
  if (!id.success || !(target in STATUSES)) return fail('Ese pedido ya no existe.');

  const order = await findOrderById(id.data);
  if (!order || order.erased) return fail('Ese pedido ya no existe.');
  if (awaitingPayment(order)) return fail('Este pedido todavía no está pagado.');
  if (nextStatus(order.status) !== target) {
    return fail(`El pedido ya está en «${STATUSES[order.status].label}». Recarga la página.`);
  }

  const updated = await setOrderStatus(order.id, target);
  if (!updated) return fail('Ese pedido ya no existe.');
  await audit(begun, 'order.status', order, `${STATUSES[order.status].label} → ${STATUSES[target].label}`);
  revalidate(order.id);
  return ok(`Marcado como «${STATUSES[target].label}».`);
}

/**
 * Cancel, and give the money back when it was paid by card ("refunded if we
 * can't deliver"). If Stripe refuses the refund, nothing is cancelled: an
 * order must never end up cancelled with the customer's money still kept.
 */
export async function cancelOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('Ese pedido ya no existe.');
  const order = await findOrderById(id.data);
  if (!order || order.erased) return fail('Ese pedido ya no existe.');
  if (order.status === 'cancelado') return fail('Ya está cancelado.');
  if (order.status === 'entregado') return fail('Ya se entregó. Si hay que devolver dinero, usa «Devolver».');

  let refunded = 0;
  const refundable = order.paidCents - order.refundedCents;
  if (formData.get('refund') === 'true' && order.paymentMethod === 'stripe' && refundable > 0) {
    const result = await refundOrder(order.id, null, actorOf(begun));
    if (!result.ok) return fail(`No se ha cancelado: Stripe no ha hecho la devolución (${result.message ?? result.reason}).`);
    refunded = refundable;
  }
  await setOrderStatus(order.id, 'cancelado');
  // A company order already invoiced: its rectificativa.
  await rectifyAfterChange(order.id, actorOf(begun));
  await audit(begun, 'order.cancel', order, refunded ? `Devuelto ${formatEuros(refunded)}` : 'Sin devolución');
  revalidate(order.id);
  return ok(refunded ? `Cancelado y devuelto ${formatEuros(refunded)}.` : 'Cancelado.');
}

/** Undo a cancellation, as long as no money has gone back. */
export async function restoreOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('Ese pedido ya no existe.');
  const order = await findOrderById(id.data);
  if (!order || order.erased || order.status !== 'cancelado') return fail('Ese pedido no está cancelado.');
  if (order.refundedCents > 0) return fail('Ya se devolvió el dinero: haz un pedido nuevo en vez de recuperarlo.');
  if (await orderWasRectified(order.id)) {
    return fail('Su factura ya tiene una rectificativa por la cancelación: haz un pedido nuevo en vez de recuperarlo.');
  }
  await setOrderStatus(order.id, 'nuevo');
  await audit(begun, 'order.restore', order, 'Cancelado → Nuevo');
  revalidate(order.id);
  return ok('Recuperado: vuelve a estar en «Nuevo».');
}

/** Give back part or all of a card payment (a price correction, a problem with the cake…). */
export async function refundOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const parsed = z
    .object({ id: idSchema, amount: eurosSchema(2000) })
    .safeParse({ id: formData.get('id'), amount: formData.get('amount') ?? '' });
  if (!parsed.success) return fail('Revisa el importe.', toFieldErrors(parsed.error.issues));

  const result = await refundOrder(parsed.data.id, parsed.data.amount, actorOf(begun));
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: 'Ese pedido ya no existe.',
      not_refundable: 'No hay nada que devolver en este pedido.',
      too_much: 'No se puede devolver más de lo que queda pagado.',
      stripe: `Stripe no ha hecho la devolución: ${result.message ?? ''}`,
    };
    return fail(messages[result.reason] ?? 'No se ha podido devolver.', result.reason === 'too_much' ? { amount: 'Demasiado' } : undefined);
  }
  const amount = result.order.refundedCents;
  await audit(begun, 'order.refund', result.order, `Devuelto en total ${formatEuros(amount)}`);
  revalidate(result.order.id);
  return ok(`Hecho. Devuelto en total: ${formatEuros(amount)}.`);
}

/**
 * The team's side of an order: the day, the time slot, an internal note, and
 * (owner only) the delivery price and the bakery.
 */
export async function updateOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;
  const isOwner = begun.session.user.role === 'owner';
  const parsed = z
    .object({
      id: idSchema,
      deliverOn: isoDaySchema,
      timeSlot: enumOf(SLOT_IDS, 'Elige la franja'),
      staffNote: optionalText(ORDER_LIMITS.notes),
      deliveryEuros: eurosSchema(200),
      bakeryId: idSchema.optional(),
    })
    .safeParse({
      id: formData.get('id'),
      deliverOn: formData.get('deliverOn'),
      timeSlot: formData.get('timeSlot'),
      staffNote: formData.get('staffNote') ?? '',
      deliveryEuros: formData.get('deliveryEuros') ?? '',
      bakeryId: formData.get('bakeryId') || undefined,
    });
  if (!parsed.success) return fail('Revisa los datos.', toFieldErrors(parsed.error.issues));

  const order = await findOrderById(parsed.data.id);
  if (!order || order.erased) return fail('Ese pedido ya no existe.');
  const deliveryCents = isOwner && parsed.data.deliveryEuros !== null ? parsed.data.deliveryEuros : order.deliveryCents;
  let bakeryId = order.bakeryId;
  if (isOwner && parsed.data.bakeryId && parsed.data.bakeryId !== order.bakeryId) {
    const bakery = await findBakery(parsed.data.bakeryId);
    if (!bakery?.active) return fail('Esa pastelería no está activa.', { bakeryId: 'No activa' });
    bakeryId = bakery.id;
  }

  await updateOrderStaff(order.id, {
    deliverOn: parsed.data.deliverOn,
    timeSlot: parsed.data.timeSlot,
    staffNote: parsed.data.staffNote,
    deliveryCents,
    bakeryId,
  });
  const changes: string[] = [];
  if (parsed.data.deliverOn !== order.deliverOn) changes.push(`día ${longDate(parsed.data.deliverOn)}`);
  if (parsed.data.timeSlot !== order.timeSlot) changes.push(`franja ${parsed.data.timeSlot === 'manana' ? 'mañana' : 'tarde'}`);
  if (deliveryCents !== order.deliveryCents) changes.push(`entrega ${formatEuros(deliveryCents)}`);
  if (bakeryId !== order.bakeryId) changes.push('pastelería');
  if (parsed.data.staffNote !== order.staffNote) changes.push('nota');
  if (changes.length) await audit(begun, 'order.update', order, changes.join(', '));
  // A lower price on an order paid by transfer and already invoiced: its rectificativa.
  if (deliveryCents < order.deliveryCents) await rectifyAfterChange(order.id, actorOf(begun));
  revalidate(order.id);

  const charged = order.paymentMethod === 'stripe' && order.paidCents > 0 && deliveryCents !== order.deliveryCents;
  return ok(charged ? 'Guardado. Ojo: el cobro con tarjeta no cambia; si baja el precio, devuelve la diferencia.' : 'Guardado.');
}

/** Orders paid by transfer (company birthdays): mark them paid, or not. */
export async function manualPaymentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('Ese pedido ya no existe.');
  const paid = formData.get('paid') === 'true';
  const order = await setManualPayment(id.data, paid);
  if (!order) return fail('Solo se puede en pedidos por transferencia.');
  await audit(begun, 'order.payment', order, paid ? `Cobrado ${formatEuros(order.totalCents)}` : 'Marcado sin cobrar');
  revalidate(order.id);
  return ok(paid ? 'Marcado como cobrado.' : 'Marcado como pendiente de cobro.');
}

/** Before the 90 days are up, when someone asks: the people out, the numbers stay. */
export async function eraseOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('Ese pedido ya no existe.');
  if (String(formData.get('confirm') ?? '').trim().toUpperCase() !== 'BORRAR') {
    return fail('Escribe BORRAR para confirmarlo.', { confirm: 'Escribe BORRAR' });
  }
  const order = await findOrderById(id.data);
  if (!order) return fail('Ese pedido ya no existe.');
  if (!(await eraseOrder(order.id))) return fail('Ya estaban borrados.');
  await audit(begun, 'order.erase', order, 'Datos personales borrados a petición');
  revalidate(order.id);
  return ok('Datos personales borrados. Queda la tarta, el día y el importe, para la contabilidad.');
}

/** A cancelled order with no money in or out, gone for good: a test, or one made by mistake. */
export async function deleteOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('Ese pedido ya no existe.');
  if (String(formData.get('confirm') ?? '').trim().toUpperCase() !== 'BORRAR') {
    return fail('Escribe BORRAR para confirmarlo.', { confirm: 'Escribe BORRAR' });
  }
  const order = await findOrderById(id.data);
  if (!order) return fail('Ese pedido ya no existe.');
  if (!canDeleteOrder(order) || !(await deleteCancelledOrder(order.id))) {
    return fail('Solo se puede borrar un pedido cancelado, sin ningún cobro y sin factura.');
  }
  await recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'order.delete',
    detail: `Pedido nº ${order.id} borrado entero (cancelado, sin cobros)`,
    ipHash: begun.ipHash,
  });
  revalidatePath('/admin');
  redirect('/admin');
}
