'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { slugify } from '@/lib/format';
import { formatEuros } from '@/lib/orders';
import { formatPostcodes, overlaps } from '@/lib/zones';
import { recordAudit } from '@/server/repositories/audit';
import {
  findBakery,
  findCake,
  findZone,
  insertBakery,
  insertCake,
  insertZone,
  listBakeries,
  listZones,
  updateBakery,
  updateCake,
  updateZone,
} from '@/server/repositories/catalog';
import { bakerySchema, cakeSchema, newBakerySchema, zoneSchema } from '@/server/validation/panel';
import { idSchema } from '@/server/validation/schemas';

import { beginMutation, isActionState, type Begun } from './begin';
import { formFields } from './form-data';
import { fail, ok, toFieldErrors, type ActionState } from './types';

/**
 * The catalog: partner bakeries, the postcodes each one delivers to, and
 * their menus. Owner only — these decide what customers can buy and at what
 * price.
 */

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

function revalidateCatalog(bakeryId?: number) {
  revalidatePath('/admin/pastelerias');
  if (bakeryId) revalidatePath(`/admin/pastelerias/${bakeryId}`);
  // The public pages read the menu on every request; this only drops any cached copy.
  revalidatePath('/');
  revalidatePath('/enviar');
}

export async function createBakeryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const parsed = newBakerySchema.safeParse(formFields(formData, ['name', 'city']));
  if (!parsed.success) return fail('Revisa los datos.', toFieldErrors(parsed.error.issues));

  const base = slugify(`${parsed.data.name} ${parsed.data.city}`) || 'pasteleria';
  let id: number | null = null;
  for (let n = 1; n <= 20 && id === null; n++) {
    id = await insertBakery({
      slug: n === 1 ? base : `${base}-${n}`,
      name: parsed.data.name,
      city: parsed.data.city,
      address: null,
      contactName: null,
      phone: null,
      whatsapp: null,
      email: null,
      printsPhotos: false,
      // A new bakery has no zones or menu yet: nothing reaches it until both exist.
      active: true,
      sizeNotes: {},
      notes: null,
    });
  }
  if (id === null) return fail('Ya hay una pastelería con ese nombre en esa ciudad.');
  await audit(begun, 'bakery.create', `bakery:${id}`, parsed.data.name);
  revalidateCatalog();
  redirect(`/admin/pastelerias/${id}`);
}

export async function updateBakeryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  const bakery = id.success ? await findBakery(id.data) : null;
  if (!bakery) return fail('Esa pastelería ya no existe.');

  const parsed = bakerySchema.safeParse({
    ...formFields(formData, ['name', 'city', 'address', 'contactName', 'phone', 'whatsapp', 'email', 'notePequena', 'noteMediana', 'noteGrande', 'notes']),
    printsPhotos: formData.get('printsPhotos'),
    active: formData.get('active'),
  });
  if (!parsed.success) return fail('Revisa los datos.', toFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const sizeNotes: Record<string, string> = {};
  if (d.notePequena) sizeNotes.pequena = d.notePequena;
  if (d.noteMediana) sizeNotes.mediana = d.noteMediana;
  if (d.noteGrande) sizeNotes.grande = d.noteGrande;

  await updateBakery(bakery.id, {
    name: d.name,
    city: d.city,
    address: d.address,
    contactName: d.contactName,
    phone: d.phone,
    whatsapp: d.whatsapp,
    email: d.email,
    printsPhotos: d.printsPhotos,
    active: d.active,
    sizeNotes,
    notes: d.notes,
  });
  const changes: string[] = [];
  if (d.active !== bakery.active) changes.push(d.active ? 'activada' : 'pausada');
  if (d.printsPhotos !== bakery.printsPhotos) changes.push(d.printsPhotos ? 'con foto impresa' : 'sin foto impresa');
  await audit(begun, 'bakery.update', `bakery:${bakery.id}`, [d.name, ...changes].join(' · '));
  revalidateCatalog(bakery.id);
  return ok(d.active ? 'Guardado.' : 'Guardado. Está pausada: no recibe pedidos nuevos de la web.');
}

/**
 * Creates or edits a delivery zone. One postcode belongs to one active zone,
 * and — while the order form shows one menu per city — one city to one
 * bakery; both are checked here, where the owner can still fix them.
 */
export async function saveZoneAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const parsed = zoneSchema.safeParse({
    ...formFields(formData, ['bakeryId', 'name', 'city', 'postalCodes', 'deliveryEuros']),
    id: formData.get('id') || undefined,
    active: formData.get('active'),
  });
  if (!parsed.success) return fail('Revisa los datos.', toFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const bakery = await findBakery(d.bakeryId);
  if (!bakery) return fail('Esa pastelería ya no existe.');
  const existing = d.id ? await findZone(d.id) : null;
  if (d.id && (!existing || existing.bakeryId !== bakery.id)) return fail('Esa zona ya no existe.');

  if (d.active) {
    const zones = await listZones();
    const taken = overlaps(d.postalCodes, zones, existing?.id ?? null);
    if (taken.length > 0) {
      return fail('Hay códigos que ya reparte otra zona activa: un código postal, una pastelería.', {
        postalCodes: `Ya los reparte otra zona: ${formatPostcodes(taken)}`,
      });
    }
    const bakeries = await listBakeries();
    const activeBakery = new Set(bakeries.filter((b) => b.active).map((b) => b.id));
    const cityOwner = zones.find(
      (z) => z.active && z.bakeryId !== bakery.id && activeBakery.has(z.bakeryId) && z.city.toLowerCase() === d.city.toLowerCase(),
    );
    if (cityOwner) {
      const other = bakeries.find((b) => b.id === cityOwner.bakeryId)?.name ?? 'otra pastelería';
      return fail(`De momento cada ciudad tiene una sola pastelería, y en ${d.city} ya está ${other}.`, {
        city: `En ${d.city} ya reparte ${other}`,
      });
    }
  }

  const zone = { name: d.name, city: d.city, postalCodes: d.postalCodes, deliveryCents: d.deliveryEuros, active: d.active };
  const detail = `${d.name}: ${formatPostcodes(d.postalCodes)} · entrega ${formatEuros(d.deliveryEuros)}${d.active ? '' : ' · pausada'}`;
  if (existing) {
    await updateZone(existing.id, zone);
    await audit(begun, 'zone.update', `bakery:${bakery.id}`, detail);
  } else {
    await insertZone({ ...zone, bakeryId: bakery.id });
    await audit(begun, 'zone.create', `bakery:${bakery.id}`, detail);
  }
  revalidateCatalog(bakery.id);
  revalidatePath('/admin/ajustes');
  return ok(existing ? 'Zona guardada.' : 'Zona añadida.');
}

/** Creates or edits a cake on a bakery's menu. Prices are per size; a blank size is not offered. */
export async function saveCakeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const parsed = cakeSchema.safeParse({
    ...formFields(formData, ['bakeryId', 'name', 'description', 'photo', 'pricePequena', 'priceMediana', 'priceGrande', 'sortOrder']),
    id: formData.get('id') || undefined,
    active: formData.get('active'),
  });
  if (!parsed.success) return fail('Revisa los datos.', toFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const bakery = await findBakery(d.bakeryId);
  if (!bakery) return fail('Esa pastelería ya no existe.');
  const existing = d.id ? await findCake(d.id) : null;
  if (d.id && (!existing || existing.bakeryId !== bakery.id)) return fail('Esa tarta ya no existe.');

  const cake = {
    name: d.name,
    description: d.description,
    photo: d.photo,
    prices: { pequena: d.pricePequena, mediana: d.priceMediana, grande: d.priceGrande },
    active: d.active,
    sortOrder: d.sortOrder,
  };
  const prices = (['pequena', 'mediana', 'grande'] as const)
    .map((size) => cake.prices[size])
    .map((cents) => (cents === null ? '—' : formatEuros(cents)))
    .join(' / ');
  const detail = `${d.name}: ${prices}${d.active ? '' : ' · oculta'}`;

  if (existing) {
    if (!(await updateCake(existing.id, cake))) return fail('Ya hay otra tarta con ese nombre.', { name: 'Ya existe' });
    await audit(begun, 'cake.update', `bakery:${bakery.id}`, detail);
  } else {
    const id = await insertCake({ ...cake, bakeryId: bakery.id });
    if (id === null) return fail('Ya hay una tarta con ese nombre.', { name: 'Ya existe' });
    await audit(begun, 'cake.create', `bakery:${bakery.id}`, detail);
  }
  revalidateCatalog(bakery.id);
  return ok(existing ? 'Tarta guardada. Los pedidos ya hechos mantienen su precio.' : 'Tarta añadida a la carta.');
}
