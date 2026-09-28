'use server';

import { revalidatePath } from 'next/cache';

import { WEEKDAYS } from '@/lib/dates';
import { formatVatRate } from '@/lib/invoices';
import { formatEuros } from '@/lib/orders';
import { recordAudit } from '@/server/repositories/audit';
import { listZones, setZoneDelivery } from '@/server/repositories/catalog';
import { getBusiness, getSettings, saveBusiness, saveSettings } from '@/server/repositories/settings';
import { applyPendingSchemaUpdates } from '@/server/services/schema-updates';
import { businessSchema, deliveryPriceSchema, settingsSchema } from '@/server/validation/panel';

import { beginMutation, isActionState, type Begun } from './begin';
import { formFields } from './form-data';
import { fail, ok, toFieldErrors, type ActionState } from './types';

async function audit(begun: Begun, action: string, target: string, detail: string | null) {
  await recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action,
    target,
    detail,
    ipHash: begun.ipHash,
  });
}

function revalidatePublic() {
  revalidatePath('/admin/ajustes');
  revalidatePath('/');
  revalidatePath('/enviar');
}

/** The switch, the notice, how far ahead, the days without deliveries, Tartale's WhatsApp. */
export async function saveSettingsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const parsed = settingsSchema.safeParse({
    ...formFields(formData, ['minNoticeDays', 'maxDaysAhead', 'whatsappNumber']),
    ordersEnabled: formData.get('ordersEnabled'),
    closedWeekdays: formData.getAll('closedWeekdays').map(String),
  });
  if (!parsed.success) return fail('Revisa los ajustes.', toFieldErrors(parsed.error.issues));
  const next = parsed.data;
  const before = await getSettings();
  await saveSettings(next);

  const changes: string[] = [];
  if (next.ordersEnabled !== before.ordersEnabled) changes.push(next.ordersEnabled ? 'pedidos abiertos' : 'pedidos cerrados');
  if (next.minNoticeDays !== before.minNoticeDays) changes.push(`antelación ${next.minNoticeDays} d`);
  if (next.maxDaysAhead !== before.maxDaysAhead) changes.push(`hasta ${next.maxDaysAhead} d`);
  if (next.closedWeekdays.join() !== before.closedWeekdays.join()) {
    const names = next.closedWeekdays.map((d) => WEEKDAYS.find((w) => w.id === d)?.label ?? String(d));
    changes.push(names.length ? `sin reparto: ${names.join(', ')}` : 'reparto todos los días');
  }
  if (next.whatsappNumber !== before.whatsappNumber) changes.push('WhatsApp');
  if (changes.length) await audit(begun, 'settings.update', 'settings', changes.join(' · '));
  revalidatePublic();
  return ok(next.ordersEnabled ? 'Guardado.' : 'Guardado. Los pedidos están cerrados: la web lo dice y no acepta ninguno.');
}

/**
 * Tartale's legal details and the VAT rate: on the legal pages and on every
 * invoice from now on (invoices already issued keep the details they had).
 */
export async function saveBusinessAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const parsed = businessSchema.safeParse(
    formFields(formData, ['legalName', 'taxId', 'address', 'postalCode', 'city', 'email', 'registry', 'vatRateBp', 'invoiceNote']),
  );
  if (!parsed.success) return fail('Revisa los datos.', toFieldErrors(parsed.error.issues));
  const next = parsed.data;
  let before;
  try {
    before = await getBusiness();
  } catch {
    return fail('Antes, pulsa «Actualizar la base de datos» (más abajo): esta versión la necesita para guardar estos datos.');
  }
  await saveBusiness(next);

  const labels: Record<keyof typeof next, string> = {
    legalName: 'razón social',
    taxId: 'NIF',
    address: 'dirección',
    postalCode: 'código postal',
    city: 'población',
    email: 'email',
    registry: 'datos registrales',
    vatRateBp: 'IVA',
    invoiceNote: 'nota de las facturas',
  };
  const changes = (Object.keys(labels) as (keyof typeof next)[])
    .filter((k) => next[k] !== before[k])
    .map((k) => (k === 'vatRateBp' ? `IVA ${next.vatRateBp === null ? 'sin fijar' : formatVatRate(next.vatRateBp)}` : labels[k]));
  if (changes.length) await audit(begun, 'settings.business', 'settings', changes.join(' · '));
  revalidatePath('/', 'layout');
  return ok('Guardado. Sale así en el aviso legal, la privacidad y las facturas nuevas.');
}

/** Every zone's delivery price, on one screen. Fields are `zone-<id>`. */
export async function saveDeliveryPricesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const zones = await listZones();
  const errors: Record<string, string> = {};
  const updates: { id: number; name: string; from: number; to: number }[] = [];
  for (const zone of zones) {
    const field = `zone-${zone.id}`;
    const raw = formData.get(field);
    if (typeof raw !== 'string') continue;
    const parsed = deliveryPriceSchema.safeParse(raw);
    if (!parsed.success) {
      errors[field] = parsed.error.issues[0]?.message ?? 'Importe no válido';
      continue;
    }
    if (parsed.data !== zone.deliveryCents) updates.push({ id: zone.id, name: zone.name, from: zone.deliveryCents, to: parsed.data });
  }
  if (Object.keys(errors).length) return fail('Revisa los importes.', errors);
  if (updates.length === 0) return ok('Nada que cambiar.');
  for (const u of updates) await setZoneDelivery(u.id, u.to);
  await audit(
    begun,
    'zone.delivery',
    'settings',
    updates.map((u) => `${u.name}: ${formatEuros(u.from)} → ${formatEuros(u.to)}`).join(' · '),
  );
  revalidatePublic();
  revalidatePath('/admin/pastelerias', 'layout');
  return ok('Precios de entrega guardados. Los pedidos ya hechos no cambian.');
}

/** Applies the database updates this version needs and the database lacks. Idempotent. */
export async function applySchemaUpdatesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  let applied: string[];
  try {
    applied = await applyPendingSchemaUpdates();
  } catch (error) {
    console.error('[schema] update failed', error instanceof Error ? error.message : error);
    return fail('No se ha podido actualizar la base de datos. No se ha cambiado nada: todo va en una transacción.');
  }
  if (applied.length === 0) return ok('La base de datos ya estaba al día.');
  await audit(begun, 'schema.update', 'database', applied.join(' · '));
  revalidatePath('/admin', 'layout');
  return ok(`Hecho: ${applied.join(' · ')}.`);
}
