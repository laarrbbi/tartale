import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';

import { GET as birthdaysCron } from '../src/app/api/cron/cumpleanos/route';
import { GET as retentionCron } from '../src/app/api/cron/limpieza/route';
import { addDays, madridToday } from '../src/lib/dates';
import { insertBirthdays, insertCompany, listBirthdays, type BirthdayInput } from '../src/server/repositories/birthdays';
import { canDeleteOrder } from '../src/lib/orders';
import { deleteCancelledOrder, findOrderById } from '../src/server/repositories/orders';
import { saveSettings, DEFAULT_SETTINGS } from '../src/server/repositories/settings';
import { createDueBirthdayOrders } from '../src/server/services/birthday-service';
import { runRetention } from '../src/server/services/retention-service';
import { birthdayImportSchema } from '../src/server/validation/panel';

import { countRows, resetTestDb, sqlAll, sqlOne, sqlRun, startTestDb, stopTestDb } from './pg-harness';

before(() => startTestDb());
beforeEach(() => resetTestDb());
after(stopTestDb);

const TODAY = madridToday();

async function aCompany(): Promise<number> {
  return insertCompany({
    name: 'Acme Levante',
    contactName: 'Paula Ríos',
    contactPhone: '+34 600 000 111',
    contactEmail: 'paula@acme.test',
    billingNotes: 'B12345678 · transferencia a 30 días',
  });
}

async function cakeId(name: string): Promise<number> {
  return (await sqlOne<{ id: number }>('select id from cakes where name = $1', [name]))!.id;
}

/** Someone whose birthday falls `inDays` from today, at home (no weekend shifts). */
async function aPerson(companyId: number, inDays: number, overrides: Partial<BirthdayInput> = {}): Promise<number> {
  const day = addDays(TODAY, inDays);
  await insertBirthdays([
    {
      companyId,
      active: true,
      recipientName: 'Lucía Martínez Soler',
      recipientCompany: null,
      day: Number(day.slice(8, 10)),
      month: Number(day.slice(5, 7)),
      addressKind: 'casa',
      address: 'Calle Mayor 3, 2º',
      postalCode: '03002',
      deliveryNotes: 'Portero automático 2B',
      cakeId: await cakeId('Lotus'),
      size: 'mediana',
      cardDesign: 'mano',
      cardMessage: 'Muchas felicidades, {nombre}.',
      signOff: 'Tu equipo de Acme',
      timeSlot: 'manana',
      ...overrides,
    },
  ]);
  return (await sqlOne<{ id: number }>('select max(id)::int as id from birthdays'))!.id;
}

test('a pasted list: each line, the office address for the lines without one, and nothing saved if one line is wrong', () => {
  const base = {
    companyId: '1',
    cakeId: '1',
    size: 'mediana',
    timeSlot: 'manana',
    addressKind: 'oficina',
    cardDesign: 'clasica',
    cardMessage: '',
    signOff: '',
    deliveryNotes: '',
    address: 'Av. Maisonnave 11',
    postalCode: '03003',
  };
  const parsed = birthdayImportSchema.parse({ ...base, list: 'Lucía Pérez; 14/03\nMarcos Gil\t02/11\tAcme\tCalle Mayor 3\t03002' });
  assert.deepEqual(
    parsed.people.map((p) => [p.name, p.day, p.month, p.address, p.postalCode]),
    [
      ['Lucía Pérez', 14, 3, 'Av. Maisonnave 11', '03003'],
      ['Marcos Gil', 2, 11, 'Calle Mayor 3', '03002'],
    ],
  );
  assert.equal(birthdayImportSchema.safeParse({ ...base, list: 'Lucía Pérez; 31/02' }).success, false);
  assert.equal(birthdayImportSchema.safeParse({ ...base, list: 'Lucía; 14/03', address: '', postalCode: '' }).success, false);
  assert.equal(birthdayImportSchema.safeParse({ ...base, list: '   ' }).success, false);
});

test('a birthday a week away becomes a "Nuevo" order, priced from the menu, confirmed with whoever pays', async () => {
  const companyId = await aCompany();
  const due = await aPerson(companyId, 7);
  await aPerson(companyId, 20); // not yet

  const run = await createDueBirthdayOrders(TODAY);
  assert.equal(run.created.length, 1);
  assert.deepEqual(run.problems, []);

  const order = (await findOrderById(run.created[0]!))!;
  assert.equal(order.birthdayId, due);
  assert.equal(order.source, 'cumpleanos');
  assert.equal(order.status, 'nuevo');
  assert.equal(order.paymentMethod, 'transferencia');
  assert.equal(order.paymentStatus, 'pendiente');
  assert.equal(order.occasion, 'cumpleanos');
  assert.equal(order.deliverOn, addDays(TODAY, 7));
  assert.equal(order.birthdayYear, Number(addDays(TODAY, 7).slice(0, 4)));
  assert.equal(order.priceCents, 4600); // Lotus, mediana, from the seed menu
  assert.equal(order.deliveryCents, 1000);
  assert.equal(order.cardDesign, 'mano');
  assert.equal(order.cardMessage, 'Muchas felicidades, Lucía.');
  assert.equal(order.recipientCompany, 'Acme Levante');
  assert.equal(order.recipientPhone, null);
  assert.equal(order.senderName, 'Paula Ríos');
  assert.equal(order.senderPhone, '+34 600 000 111');
  assert.equal(order.senderCompany, 'Acme Levante');
  assert.equal(order.city, 'Alicante');
  assert.equal(order.staffNote, null, 'delivered on the day itself');
});

test('once a year: running again, the next day, or by hand never makes a second order', async () => {
  const companyId = await aCompany();
  await aPerson(companyId, 3); // added late: due at once
  assert.equal((await createDueBirthdayOrders(TODAY)).created.length, 1);
  assert.equal((await createDueBirthdayOrders(TODAY)).created.length, 0);
  assert.equal((await createDueBirthdayOrders(addDays(TODAY, 1))).created.length, 0);
  assert.equal(await countRows('orders', "where source = 'cumpleanos'"), 1);

  // Even a cancelled order counts: the owner restores it rather than getting a duplicate.
  await sqlRun(`update orders set status = 'cancelado'`);
  assert.equal((await createDueBirthdayOrders(TODAY)).created.length, 0);
  // The database itself refuses a second one for the same birthday and year.
  await assert.rejects(
    sqlRun(
      `insert into orders (public_id, source, payment_method, occasion, bakery_id, cake_name, size, price_cents, delivery_cents,
         address_kind, city, deliver_on, time_slot, birthday_id, birthday_year)
       select 'dup-public-id-000000', source, payment_method, occasion, bakery_id, cake_name, size, price_cents, delivery_cents,
         address_kind, city, deliver_on, time_slot, birthday_id, birthday_year from orders limit 1`,
    ),
  );
});

test('paused people and today’s birthdays: no order', async () => {
  const companyId = await aCompany();
  await aPerson(companyId, 5, { active: false });
  await aPerson(companyId, 0); // today: too late for this year's cake
  const run = await createDueBirthdayOrders(TODAY);
  assert.equal(run.created.length, 0);
  assert.equal(await countRows('orders'), 0);
});

test('an office birthday at the weekend goes out on the Friday, with a note for the team', async () => {
  const companyId = await aCompany();
  // The next Sunday at least a week away.
  let sunday = addDays(TODAY, 8);
  while (new Date(`${sunday}T12:00:00Z`).getUTCDay() !== 0) sunday = addDays(sunday, 1);
  await aPerson(companyId, Math.round((Date.parse(sunday) - Date.parse(TODAY)) / 86_400_000), { addressKind: 'oficina' });

  const friday = addDays(sunday, -2);
  assert.equal((await createDueBirthdayOrders(addDays(friday, -8))).created.length, 0, 'not due yet');
  const run = await createDueBirthdayOrders(addDays(friday, -7));
  assert.equal(run.created.length, 1);
  const order = (await findOrderById(run.created[0]!))!;
  assert.equal(order.deliverOn, friday);
  assert.match(order.staffNote ?? '', /el cumpleaños es el domingo/);
});

test('someone we can no longer deliver to is reported, without their name in the log', async () => {
  const companyId = await aCompany();
  await aPerson(companyId, 6, { postalCode: '28001' });
  await sqlRun(`update cakes set active = false where name = 'Lotus'`);
  await aPerson(companyId, 6, { recipientName: 'Marcos Gil' });

  const run = await createDueBirthdayOrders(TODAY);
  assert.equal(run.created.length, 0);
  assert.equal(run.problems.length, 2);
  assert.match(run.problems[0]!.problem, /No repartimos en el 28001/);
  const log = await sqlOne<{ detail: string }>(`select detail from audit_log where action = 'birthday.problem'`);
  assert.ok(log?.detail);
  assert.doesNotMatch(log!.detail, /Lucía|Marcos|Mayor/);
});

test('the closed weekday setting moves a cake earlier, never later', async () => {
  const companyId = await aCompany();
  const target = addDays(TODAY, 10);
  const closed = new Date(`${target}T12:00:00Z`).getUTCDay();
  await saveSettings({ ...DEFAULT_SETTINGS, closedWeekdays: [closed] });
  await aPerson(companyId, 10);
  const run = await createDueBirthdayOrders(addDays(TODAY, 2));
  assert.equal(run.created.length, 1);
  assert.equal((await findOrderById(run.created[0]!))!.deliverOn, addDays(target, -1));
});

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

async function anOrderDeliveredDaysAgo(days: number, status = 'entregado'): Promise<number> {
  const row = await sqlOne<{ id: number }>(
    `insert into orders (public_id, source, payment_method, payment_status, status, occasion, bakery_id, cake_name, size,
       price_cents, delivery_cents, paid_cents, cake_text, card_message, sign_off, recipient_name, recipient_company,
       recipient_phone, address_kind, address, postal_code, city, delivery_notes, deliver_on, time_slot, sender_name,
       sender_phone, sender_email, sender_company, staff_note, has_photo, allergies, ip_hash)
     values (substr(md5(random()::text), 1, 22), 'web', 'stripe', 'pagado', $2, 'inversor', 1, 'Lotus', 'mediana',
       4600, 1000, 5600, '¿Un café?', 'Hablemos', 'Pablo', 'Marta Ruiz', 'Fondo', '600111222', 'oficina',
       'Av. Maisonnave 11', '03003', 'Alicante', '4ª planta', $1::date, 'manana', 'Pablo Gil', '600123456',
       'pablo@startup.test', 'Startup', 'Llamar antes', true, 'Frutos secos', 'iphash')
     returning id`,
    [addDays(TODAY, -days), status],
  );
  await sqlRun(`insert into order_photos (order_id, mime, bytes) values ($1, 'image/jpeg', '\\xffd8ff'::bytea)`, [row!.id]);
  await sqlRun(
    `insert into order_documents (order_id, mime, filename, size_bytes, bytes) values ($1, 'application/pdf', 'CV.pdf', 5, '\\x255044462d'::bytea)`,
    [row!.id],
  );
  await sqlRun('update orders set has_document = true where id = $1', [row!.id]);
  return row!.id;
}

test('retention: 90 days after delivery the people go, whatever the status; what, when and how much stay', async () => {
  const old = await anOrderDeliveredDaysAgo(91);
  const forgotten = await anOrderDeliveredDaysAgo(95, 'confirmado'); // never marked delivered
  const recent = await anOrderDeliveredDaysAgo(89);

  const run = await runRetention(TODAY);
  assert.equal(run.erased, 2);

  for (const id of [old, forgotten]) {
    const o = (await findOrderById(id))!;
    assert.ok(o.erased);
    for (const field of [
      o.recipientName,
      o.recipientCompany,
      o.recipientPhone,
      o.address,
      o.postalCode,
      o.deliveryNotes,
      o.cardMessage,
      o.signOff,
      o.senderName,
      o.senderPhone,
      o.senderEmail,
      o.senderCompany,
      o.staffNote,
      o.allergies,
    ]) {
      assert.equal(field, null);
    }
    assert.equal(o.hasDocument, false);
    assert.equal(o.cakeName, 'Lotus');
    assert.equal(o.totalCents, 5600);
    assert.equal(o.paidCents, 5600);
  }
  assert.equal(await countRows('order_photos'), 1, 'only the recent order keeps its photo');
  assert.equal(await countRows('order_documents'), 1, 'and its document');
  assert.equal((await findOrderById(recent))!.recipientName, 'Marta Ruiz');
  assert.equal((await runRetention(TODAY)).erased, 0, 'nothing twice');
  const log = await sqlAll<{ detail: string }>(`select detail from audit_log where action = 'retention.run'`);
  assert.equal(log.length, 1);
  assert.doesNotMatch(log[0]!.detail, /Marta|Pablo/);
});

test('retention: the activity log keeps two years, and expired sessions and counters go', async () => {
  await sqlRun(`insert into audit_log (action, created_at) values ('old', now() - interval '731 days'), ('recent', now())`);
  await sqlRun(`insert into rate_limits (bucket_key, window_start, hits) values ('x', 1, 1)`);
  const run = await runRetention(TODAY);
  assert.equal(run.audit, 1);
  assert.equal(run.rateLimits, 1);
  assert.equal(await countRows('audit_log', "where action = 'old'"), 0);
});

test('the nightly jobs answer only to Vercel Cron’s secret', async () => {
  const call = (handler: (r: Request) => Promise<Response>, auth?: string) =>
    handler(new Request('https://tartale.test/api/cron/x', { headers: auth ? { authorization: auth } : {} }));
  for (const handler of [retentionCron, birthdaysCron]) {
    assert.equal((await call(handler)).status, 401);
    assert.equal((await call(handler, 'Bearer wrong')).status, 401);
    assert.equal((await call(handler, process.env.CRON_SECRET)).status, 401, 'the bare secret is not the header');
    const ok = await call(handler, `Bearer ${process.env.CRON_SECRET}`);
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { ok: boolean }).ok, true);
  }
  assert.equal((await listBirthdays()).length, 0);
});

test('deleting an order outright: only a cancelled one that never moved money', async () => {
  assert.equal(canDeleteOrder({ status: 'cancelado', paidCents: 0, refundedCents: 0 }), true);
  assert.equal(canDeleteOrder({ status: 'cancelado', paidCents: 5600, refundedCents: 5600 }), false);
  assert.equal(canDeleteOrder({ status: 'nuevo', paidCents: 0, refundedCents: 0 }), false);

  const paidCancelled = await anOrderDeliveredDaysAgo(-5, 'cancelado'); // paid 56 € in the helper
  const delivered = await anOrderDeliveredDaysAgo(3, 'entregado');
  const mistake = await anOrderDeliveredDaysAgo(-5, 'cancelado');
  await sqlRun('update orders set paid_cents = 0, payment_method = $2, payment_status = $3 where id = $1', [mistake, 'transferencia', 'pendiente']);

  assert.equal(await deleteCancelledOrder(paidCancelled), false, 'money moved: the books need it');
  assert.equal(await deleteCancelledOrder(delivered), false);
  assert.equal(await deleteCancelledOrder(mistake), true);
  assert.equal(await findOrderById(mistake), null);
  assert.equal(await countRows('order_photos', 'where order_id = $1', [mistake]), 0, 'its photo goes with it');
  assert.equal(await countRows('orders'), 2);
});
