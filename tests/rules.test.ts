import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { birthdayDeliveryDay, fillName, parseBirthdayList, parseDayMonth, planBirthday } from '../src/lib/birthdays';
import {
  addDays,
  checkDeliveryDay,
  daysBetween,
  earliestDelivery,
  isIsoDay,
  madridToday,
  nextBirthday,
  weekday,
  type DeliveryRules,
} from '../src/lib/dates';
import { CAKE_PHOTOS } from '../src/lib/cake-photos';
import { slugify } from '../src/lib/format';
import { eurosInput, formatEuros, fromPrice, nextStatus, priceFor, signOffFor } from '../src/lib/orders';
import { formatPostcodes, overlaps, parsePostcodes, zoneFor } from '../src/lib/zones';
import { cakeSchema, settingsSchema, zoneSchema } from '../src/server/validation/panel';
import { eurosSchema } from '../src/server/validation/schemas';

const RULES: DeliveryRules = { minNoticeDays: 1, maxDaysAhead: 365, closedWeekdays: [] };

test('dates: today is the day in Madrid, not in UTC', () => {
  // 23:30 UTC on 30 June is already 1 July in Madrid (UTC+2 in summer).
  assert.equal(madridToday(new Date('2026-06-30T23:30:00Z')), '2026-07-01');
  // 23:30 UTC on 31 December is 00:30 on 1 January in Madrid (UTC+1).
  assert.equal(madridToday(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.equal(madridToday(new Date('2026-12-31T22:30:00Z')), '2026-12-31');
});

test('dates: arithmetic crosses months, years and daylight saving', () => {
  assert.equal(addDays('2026-10-24', 2), '2026-10-26'); // clocks go back on the 25th
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // clocks go forward on the 29th
  assert.equal(weekday('2026-09-26'), 6); // a Saturday
  assert.equal(isIsoDay('2026-02-30'), false);
  assert.equal(isIsoDay('2026-02-28'), true);
  assert.equal(isIsoDay('28/02/2026'), false);
});

test('dates: minimum notice, the far limit and closed weekdays', () => {
  const now = new Date('2026-09-28T10:00:00Z'); // Monday in Madrid
  assert.equal(earliestDelivery(RULES, now), '2026-09-29');
  assert.equal(earliestDelivery({ ...RULES, minNoticeDays: 0 }, now), '2026-09-28');
  assert.equal(checkDeliveryDay('2026-09-28', RULES, now), 'too_soon');
  assert.equal(checkDeliveryDay('2026-09-29', RULES, now), null);
  assert.equal(checkDeliveryDay('2027-09-29', RULES, now), 'too_far');
  assert.equal(checkDeliveryDay('2026-13-01', RULES, now), 'invalid');
  // Sundays closed: a Saturday order with one day's notice lands on Monday.
  const closedSunday = { ...RULES, closedWeekdays: [0] };
  assert.equal(checkDeliveryDay('2026-10-04', closedSunday, now), 'closed_day');
  assert.equal(earliestDelivery(closedSunday, new Date('2026-10-03T10:00:00Z')), '2026-10-05');
  // Late at night in Madrid, "tomorrow" is counted from Madrid's date.
  assert.equal(earliestDelivery(RULES, new Date('2026-09-28T22:30:00Z')), '2026-09-30');
});

test('birthdays: the next one, and 29 February', () => {
  assert.equal(nextBirthday(14, 3, '2026-09-27'), '2027-03-14');
  assert.equal(nextBirthday(27, 9, '2026-09-27'), '2026-09-27');
  assert.equal(nextBirthday(29, 2, '2026-09-27'), '2027-02-28');
  assert.equal(nextBirthday(29, 2, '2027-09-27'), '2028-02-29');
});

test('birthdays: an office birthday at the weekend is celebrated on Friday', () => {
  assert.equal(birthdayDeliveryDay('2026-10-03', 'oficina', []), '2026-10-02'); // Saturday → Friday
  assert.equal(birthdayDeliveryDay('2026-10-04', 'oficina', []), '2026-10-02'); // Sunday → Friday
  assert.equal(birthdayDeliveryDay('2026-10-04', 'casa', []), '2026-10-04'); // at home, on the day
  assert.equal(birthdayDeliveryDay('2026-10-05', 'oficina', [1]), '2026-10-02'); // Monday closed → Friday
});

test('birthdays: a list pasted from Excel or typed by hand', () => {
  const list = parseBirthdayList(
    [
      'Ana López\t14/03\tAcme\tC/ Mayor 1\t03001',
      'Juan Pérez; 2/11',
      'Marta Ruiz; 05-06-1990; ; Av. Maisonnave 11; 03003',
      'Luis; 01/12; Av. Alfonso X 5; 03004',
      'Nombre; Fecha; Empresa',
      'Pepe; 31/02',
      'Eva; 3/4; Acme; C/ Sol 2; 0300',
      '',
    ].join('\n'),
  );
  assert.deepEqual(
    list.ok.map((l) => [l.name, l.day, l.month, l.company, l.address, l.postalCode]),
    [
      ['Ana López', 14, 3, 'Acme', 'C/ Mayor 1', '03001'],
      ['Juan Pérez', 2, 11, null, null, null],
      ['Marta Ruiz', 5, 6, null, 'Av. Maisonnave 11', '03003'],
      ['Luis', 1, 12, null, 'Av. Alfonso X 5', '03004'],
    ],
  );
  assert.deepEqual(list.bad, ['Nombre; Fecha; Empresa', 'Pepe; 31/02', 'Eva; 3/4; Acme; C/ Sol 2; 0300']);
  assert.equal(fillName('¡Feliz cumple, {nombre}!', 'Ana López'), '¡Feliz cumple, Ana!');
  assert.equal(fillName(null, 'Ana'), null);
});

test('zones: postcodes as people write them, and one bakery per postcode', () => {
  const parsed = parsePostcodes('03001–03016, 03540 03540 ; 28001 3001 03020-03010');
  assert.equal(parsed.codes.length, 18);
  assert.ok(parsed.codes.includes('03016') && parsed.codes.includes('28001') && !parsed.codes.includes('03017'));
  assert.deepEqual(parsed.bad, ['3001', '03020-03010']);
  assert.deepEqual(parsePostcodes('03001-99999').bad, ['03001-99999']);
  assert.equal(formatPostcodes(parsePostcodes('03001-03016 03540').codes), '03001–03016, 03540');
  assert.equal(formatPostcodes(['03002', '03001', '03005']), '03001, 03002, 03005');

  const zones = [
    { id: 1, active: true, postalCodes: parsePostcodes('03001-03016 03540').codes },
    { id: 2, active: false, postalCodes: ['03690'] },
  ];
  assert.equal(zoneFor('03540', zones)?.id, 1);
  assert.equal(zoneFor(' 03003 ', zones)?.id, 1);
  assert.equal(zoneFor('03690', zones), null); // inactive
  assert.equal(zoneFor('28001', zones), null);
  assert.deepEqual(overlaps(['03001', '03690'], zones, null), ['03001']);
  assert.deepEqual(overlaps(['03001'], zones, 1), []);
});

test('pricing: cents, sizes a bakery does not make, and the card signature', () => {
  const prices = { pequena: 2900, mediana: 4250, grande: null };
  assert.equal(priceFor(prices, 'mediana'), 4250);
  assert.equal(priceFor(prices, 'grande'), null);
  assert.equal(fromPrice(prices), 2900);
  assert.equal(formatEuros(4250 + 1000), '52,50\u00a0€');
  assert.equal(nextStatus('nuevo'), 'confirmado');
  assert.equal(nextStatus('en_camino'), 'entregado');
  assert.equal(nextStatus('entregado'), null);
  assert.equal(nextStatus('cancelado'), null);
  assert.equal(signOffFor({ anonymous: true, signOff: 'Pablo', senderName: 'Pablo' }), null);
  assert.equal(signOffFor({ anonymous: false, signOff: null, senderName: 'Pablo' }), 'Pablo');
});

test('panel: money typed the Spanish way, and shown back the same way', () => {
  const euros = eurosSchema(200);
  assert.equal(euros.parse('10'), 1000);
  assert.equal(euros.parse('12,50'), 1250);
  assert.equal(euros.parse(' 7,5 € '), 750);
  assert.equal(euros.parse(''), null);
  assert.equal(euros.safeParse('-3').success, false);
  assert.equal(euros.safeParse('201').success, false);
  assert.equal(euros.safeParse('1,234').success, false);
  assert.equal(eurosInput(2900), '29');
  assert.equal(eurosInput(4250), '42,50');
  assert.equal(eurosInput(3335), '33,35');
  assert.equal(eurosInput(null), '');
});

test('panel: a zone needs real postcodes and a delivery price; a cake at least one price', () => {
  const zone = { bakeryId: '1', name: 'Centro', city: 'Alicante', postalCodes: '03001–03003, 03540', deliveryEuros: '10', active: 'true' };
  const ok = zoneSchema.parse(zone);
  assert.deepEqual(ok.postalCodes, ['03001', '03002', '03003', '03540']);
  assert.equal(ok.deliveryEuros, 1000);
  assert.equal(zoneSchema.safeParse({ ...zone, postalCodes: '03001, 3540' }).success, false);
  assert.equal(zoneSchema.safeParse({ ...zone, postalCodes: '  ' }).success, false);
  assert.equal(zoneSchema.safeParse({ ...zone, deliveryEuros: '' }).success, false);

  const cake = { bakeryId: '1', name: 'Chocolate', description: '', photo: '/cakes/chocolate.jpg', pricePequena: '29', priceMediana: '', priceGrande: '', sortOrder: '10', active: 'true' };
  const parsed = cakeSchema.parse(cake);
  assert.deepEqual([parsed.pricePequena, parsed.priceMediana, parsed.priceGrande], [2900, null, null]);
  assert.equal(cakeSchema.safeParse({ ...cake, pricePequena: '' }).success, false, 'no price at all');
  assert.equal(cakeSchema.safeParse({ ...cake, photo: '/uploads/x.jpg' }).success, false, 'only the photos that ship with the site');
  assert.equal(cakeSchema.parse({ ...cake, photo: '' }).photo, null);
});

test('panel: settings keep at least one delivery day and a sane window', () => {
  const base = { ordersEnabled: 'true', minNoticeDays: '1', maxDaysAhead: '365', closedWeekdays: ['0', '0'], whatsappNumber: '' };
  const ok = settingsSchema.parse(base);
  assert.deepEqual(ok.closedWeekdays, [0]);
  assert.equal(ok.whatsappNumber, null);
  assert.equal(settingsSchema.safeParse({ ...base, closedWeekdays: ['0', '1', '2', '3', '4', '5', '6'] }).success, false);
  assert.equal(settingsSchema.safeParse({ ...base, minNoticeDays: '10', maxDaysAhead: '10' }).success, false);
  assert.equal(settingsSchema.safeParse({ ...base, whatsappNumber: '12' }).success, false);
  assert.equal(settingsSchema.parse({ ...base, whatsappNumber: '+34 663 82 32 96' }).whatsappNumber, '+34 663 82 32 96');
});

test('catalog: every cake photo offered in the panel ships with the site, and slugs are clean', () => {
  const files = fs.readdirSync(path.join(process.cwd(), 'public', 'cakes')).sort();
  assert.deepEqual(CAKE_PHOTOS.map((p) => p.path.replace('/cakes/', '')).sort(), files);
  assert.equal(slugify('Levadura Madre · Gran Vía'), 'levadura-madre-gran-via');
  assert.equal(slugify('  Pâtisserie Ñandú!! '), 'patisserie-nandu');
  assert.equal(slugify('***'), '');
});

test('birthdays: the plan — next birthday that can still go out, created a week before', () => {
  // 2026-10-02 is a Friday.
  const home = planBirthday({ day: 10, month: 10, addressKind: 'casa' }, [], '2026-10-02');
  assert.deepEqual(home, { birthday: '2026-10-10', year: 2026, deliverOn: '2026-10-10', createOn: '2026-10-03' });
  // Saturday the 10th at the office: Friday the 9th, created on the 2nd.
  const office = planBirthday({ day: 10, month: 10, addressKind: 'oficina' }, [], '2026-10-02');
  assert.deepEqual(office, { birthday: '2026-10-10', year: 2026, deliverOn: '2026-10-09', createOn: '2026-10-02' });
  // On the day itself, or when the Friday has gone, it is next year's.
  assert.equal(planBirthday({ day: 2, month: 10, addressKind: 'casa' }, [], '2026-10-02').year, 2027);
  assert.equal(planBirthday({ day: 10, month: 10, addressKind: 'oficina' }, [], '2026-10-09').birthday, '2027-10-10');
  // New Year's Day on a Friday at home: the year is the birthday's, not the delivery's.
  assert.equal(planBirthday({ day: 1, month: 1, addressKind: 'casa' }, [], '2026-12-30').year, 2027);
  assert.deepEqual(parseDayMonth('14/03'), { day: 14, month: 3 });
  assert.deepEqual(parseDayMonth('29-2-1992'), { day: 29, month: 2 });
  assert.equal(parseDayMonth('31/04'), null);
  assert.equal(parseDayMonth('marzo'), null);
});
