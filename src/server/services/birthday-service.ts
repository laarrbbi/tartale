import 'server-only';

import { fillName, planBirthday, type BirthdayPlan } from '@/lib/birthdays';
import { longDate, madridToday } from '@/lib/dates';
import { ORDER_LIMITS, SIZES, priceFor } from '@/lib/orders';
import { zoneFor } from '@/lib/zones';
import { recordAudit } from '@/server/repositories/audit';
import { findCompany, listBirthdays, listCompanies, type Birthday, type Company } from '@/server/repositories/birthdays';
import { listBakeries, listCakes, listZones, type Bakery, type Cake, type Zone } from '@/server/repositories/catalog';
import { insertOrder, type Order } from '@/server/repositories/orders';
import { getSettings } from '@/server/repositories/settings';

import { newPublicId } from './order-service';

/**
 * Automatic company birthdays. A company gives us its team list once; each
 * person's cake is ordered BIRTHDAY_LEAD_DAYS before it goes out, as a "Nuevo"
 * order the team confirms with the company like any other, paid by transfer.
 * The unique index on (birthday, year) makes a second order for the same
 * birthday impossible, however many times the job runs.
 */

export interface Catalog {
  zones: Zone[];
  cakes: Cake[];
  bakeries: Bakery[];
}

export async function loadCatalog(): Promise<Catalog> {
  const [zones, cakes, bakeries] = await Promise.all([listZones(), listCakes(), listBakeries()]);
  return { zones, cakes, bakeries };
}

export type Resolution = { ok: true; zone: Zone; cake: Cake; priceCents: number } | { ok: false; problem: string };

/** Who bakes it, and for how much, from today's menu; or why it cannot be ordered, in words for the owner. */
export function resolveBirthday(person: Pick<Birthday, 'postalCode' | 'cakeId' | 'size'>, catalog: Catalog): Resolution {
  const activeBakeries = new Set(catalog.bakeries.filter((b) => b.active).map((b) => b.id));
  const zone = zoneFor(person.postalCode, catalog.zones.filter((z) => activeBakeries.has(z.bakeryId)));
  if (!zone) return { ok: false, problem: `No repartimos en el ${person.postalCode}.` };
  const cake = catalog.cakes.find((c) => c.id === person.cakeId);
  if (!cake || !cake.active) return { ok: false, problem: 'Su tarta ya no está en la carta: elige otra.' };
  if (cake.bakeryId !== zone.bakeryId) return { ok: false, problem: 'Su tarta es de una pastelería que no reparte en su código postal.' };
  const priceCents = priceFor(cake.prices, person.size);
  if (priceCents === null) return { ok: false, problem: `Su tarta no se hace en tamaño ${SIZES[person.size].label.toLowerCase()}.` };
  return { ok: true, zone, cake, priceCents };
}

export type BirthdayOrderResult =
  | { ok: true; order: Order }
  | { ok: false; reason: 'exists' }
  | { ok: false; reason: 'problem'; problem: string };

/** Makes the order for one person's next birthday. Safe to call twice: the second finds it exists. */
export async function createBirthdayOrder(
  person: Birthday,
  company: Company,
  plan: BirthdayPlan,
  catalog: Catalog,
  actor: { id: number | null; email: string | null } = { id: null, email: null },
): Promise<BirthdayOrderResult> {
  const resolved = resolveBirthday(person, catalog);
  if (!resolved.ok) return { ok: false, reason: 'problem', problem: resolved.problem };
  const { zone, cake, priceCents } = resolved;

  const order = await insertOrder({
    publicId: newPublicId(),
    source: 'cumpleanos',
    paymentMethod: 'transferencia',
    occasion: 'cumpleanos',
    bakeryId: zone.bakeryId,
    zoneId: zone.id,
    cakeId: cake.id,
    cakeName: cake.name,
    size: person.size,
    priceCents,
    deliveryCents: zone.deliveryCents,
    cakeText: fillName(person.cakeText, person.recipientName)?.slice(0, ORDER_LIMITS.cakeText) ?? null,
    cardDesign: person.cardDesign,
    cardMessage: fillName(person.cardMessage, person.recipientName)?.slice(0, ORDER_LIMITS.cardMessage) ?? null,
    signOff: fillName(person.signOff, person.recipientName)?.slice(0, ORDER_LIMITS.signOff) ?? null,
    anonymous: false,
    allergies: null,
    recipientName: person.recipientName,
    recipientCompany: person.recipientCompany ?? company.name,
    recipientPhone: null,
    addressKind: person.addressKind,
    address: person.address,
    postalCode: person.postalCode,
    city: zone.city,
    deliveryNotes: person.deliveryNotes,
    deliverOn: plan.deliverOn,
    timeSlot: person.timeSlot,
    // Whoever pays is who we talk to: the confirmation goes to the company's contact.
    senderName: company.contactName,
    senderPhone: company.contactPhone,
    senderEmail: company.contactEmail,
    senderCompany: company.name,
    companyId: company.id,
    birthdayId: person.id,
    birthdayYear: plan.year,
    ipHash: null,
    staffNote: plan.deliverOn !== plan.birthday ? `Cumpleaños automático: el cumpleaños es el ${longDate(plan.birthday)}.` : null,
  });
  if (!order) return { ok: false, reason: 'exists' };
  await recordAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'order.birthday',
    target: `order:${order.id}`,
    detail: `Cumpleaños automático · ${company.name}`,
  });
  return { ok: true, order };
}

export interface BirthdayRun {
  created: number[];
  problems: { birthdayId: number; companyId: number; problem: string }[];
}

/**
 * The nightly job: every active person whose order is due (or overdue, if a
 * night was missed) gets it. Problems are reported, not thrown: one person
 * with a postcode we no longer reach must not stop everyone else's cake.
 */
export async function createDueBirthdayOrders(today: string = madridToday()): Promise<BirthdayRun> {
  const [settings, people, companies, catalog] = await Promise.all([
    getSettings(),
    listBirthdays({ activeOnly: true }),
    listCompanies(),
    loadCatalog(),
  ]);
  const companyById = new Map<number, Company>(companies.map((c) => [c.id, c]));
  const run: BirthdayRun = { created: [], problems: [] };

  for (const person of people) {
    const plan = planBirthday(person, settings.closedWeekdays, today);
    if (today < plan.createOn) continue;
    const company = companyById.get(person.companyId);
    if (!company) continue;
    const result = await createBirthdayOrder(person, company, plan, catalog);
    if (result.ok) run.created.push(result.order.id);
    else if (result.reason === 'problem') run.problems.push({ birthdayId: person.id, companyId: company.id, problem: result.problem });
  }

  if (run.problems.length > 0) {
    await recordAudit({
      actorId: null,
      actorEmail: null,
      action: 'birthday.problem',
      target: null,
      // Ids and reasons only: the log outlives the people in it.
      detail: run.problems.map((p) => `empresa ${p.companyId}, persona ${p.birthdayId}: ${p.problem}`).join(' · ').slice(0, 1000),
    });
  }
  return run;
}

/** "Crear el pedido ahora" in the panel: the next birthday's order, without waiting for its day. */
export async function createBirthdayOrderNow(
  person: Birthday,
  actor: { id: number; email: string },
  today: string = madridToday(),
): Promise<BirthdayOrderResult & { plan: BirthdayPlan }> {
  const [settings, company, catalog] = await Promise.all([getSettings(), findCompany(person.companyId), loadCatalog()]);
  const plan = planBirthday(person, settings.closedWeekdays, today);
  if (!company) return { ok: false, reason: 'problem', problem: 'Esa empresa ya no existe.', plan };
  const result = await createBirthdayOrder(person, company, plan, catalog, actor);
  return { ...result, plan };
}
