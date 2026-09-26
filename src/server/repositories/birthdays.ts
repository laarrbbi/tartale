import 'server-only';

import type { AddressKind, CakeSize, OrderStatus, TimeSlot } from '@/lib/orders';
import { getDb, isoRequired, one } from '@/server/db/pg';

// ---------------------------------------------------------------------------
// Companies: who pays for a team's birthdays
// ---------------------------------------------------------------------------

export interface Company {
  id: number;
  name: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  billingNotes: string | null;
  createdAt: string;
}

export interface CompanySummary extends Company {
  people: number;
  active: number;
}

interface CompanyRow {
  id: number;
  name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  billing_notes: string | null;
  created_at: Date;
}

const COMPANY_COLUMNS = 'id, name, contact_name, contact_phone, contact_email, billing_notes, created_at';

function toCompany(r: CompanyRow): Company {
  return {
    id: r.id,
    name: r.name,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    billingNotes: r.billing_notes,
    createdAt: isoRequired(r.created_at),
  };
}

export async function listCompanies(): Promise<CompanySummary[]> {
  const { rows } = await getDb().query<CompanyRow & { people: number; active: number }>(
    `select c.id, c.name, c.contact_name, c.contact_phone, c.contact_email, c.billing_notes, c.created_at,
            count(b.id)::int as people, count(b.id) filter (where b.active)::int as active
       from companies c left join birthdays b on b.company_id = c.id
      group by c.id
      order by lower(c.name)`,
  );
  return rows.map((r) => ({ ...toCompany(r), people: r.people, active: r.active }));
}

export async function findCompany(id: number): Promise<Company | null> {
  const row = await one<CompanyRow>(getDb(), `select ${COMPANY_COLUMNS} from companies where id = $1`, [id]);
  return row ? toCompany(row) : null;
}

export type CompanyInput = Omit<Company, 'id' | 'createdAt'>;

export async function insertCompany(input: CompanyInput): Promise<number> {
  const row = await one<{ id: number }>(
    getDb(),
    `insert into companies (name, contact_name, contact_phone, contact_email, billing_notes)
     values ($1, $2, $3, $4, $5) returning id`,
    [input.name, input.contactName, input.contactPhone, input.contactEmail, input.billingNotes],
  );
  return row!.id;
}

export async function updateCompany(id: number, input: CompanyInput): Promise<boolean> {
  const { rowCount } = await getDb().query(
    `update companies
        set name = $2, contact_name = $3, contact_phone = $4, contact_email = $5, billing_notes = $6, updated_at = now()
      where id = $1`,
    [id, input.name, input.contactName, input.contactPhone, input.contactEmail, input.billingNotes],
  );
  return rowCount === 1;
}

/** The company and its whole list go; orders already made stay (their people are erased on schedule). */
export async function deleteCompany(id: number): Promise<boolean> {
  const { rowCount } = await getDb().query('delete from companies where id = $1', [id]);
  return rowCount === 1;
}

// ---------------------------------------------------------------------------
// Birthdays: one person on a company's list
// ---------------------------------------------------------------------------

export interface Birthday {
  id: number;
  companyId: number;
  active: boolean;
  recipientName: string;
  recipientCompany: string | null;
  day: number;
  month: number;
  addressKind: AddressKind;
  address: string;
  postalCode: string;
  deliveryNotes: string | null;
  cakeId: number;
  size: CakeSize;
  cakeText: string | null;
  cardMessage: string | null;
  signOff: string | null;
  timeSlot: TimeSlot;
}

interface BirthdayRow {
  id: number;
  company_id: number;
  active: boolean;
  recipient_name: string;
  recipient_company: string | null;
  birth_day: number;
  birth_month: number;
  address_kind: AddressKind;
  address: string;
  postal_code: string;
  delivery_notes: string | null;
  cake_id: number;
  size: CakeSize;
  cake_text: string | null;
  card_message: string | null;
  sign_off: string | null;
  time_slot: TimeSlot;
}

const BIRTHDAY_COLUMNS = `id, company_id, active, recipient_name, recipient_company, birth_day, birth_month, address_kind,
  address, postal_code, delivery_notes, cake_id, size, cake_text, card_message, sign_off, time_slot`;

function toBirthday(r: BirthdayRow): Birthday {
  return {
    id: r.id,
    companyId: r.company_id,
    active: r.active,
    recipientName: r.recipient_name,
    recipientCompany: r.recipient_company,
    day: r.birth_day,
    month: r.birth_month,
    addressKind: r.address_kind,
    address: r.address,
    postalCode: r.postal_code,
    deliveryNotes: r.delivery_notes,
    cakeId: r.cake_id,
    size: r.size,
    cakeText: r.cake_text,
    cardMessage: r.card_message,
    signOff: r.sign_off,
    timeSlot: r.time_slot,
  };
}

export async function listBirthdays(options: { companyId?: number; activeOnly?: boolean } = {}): Promise<Birthday[]> {
  const { rows } = await getDb().query<BirthdayRow>(
    `select ${BIRTHDAY_COLUMNS} from birthdays
      where ($1::bigint is null or company_id = $1) and (not $2 or active)
      order by birth_month, birth_day, lower(recipient_name)`,
    [options.companyId ?? null, options.activeOnly ?? false],
  );
  return rows.map(toBirthday);
}

export async function findBirthday(id: number): Promise<Birthday | null> {
  const row = await one<BirthdayRow>(getDb(), `select ${BIRTHDAY_COLUMNS} from birthdays where id = $1`, [id]);
  return row ? toBirthday(row) : null;
}

export type BirthdayInput = Omit<Birthday, 'id'>;

const INSERT_BIRTHDAY = `insert into birthdays (company_id, active, recipient_name, recipient_company, birth_day, birth_month,
    address_kind, address, postal_code, delivery_notes, cake_id, size, cake_text, card_message, sign_off, time_slot)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`;

function birthdayParams(b: BirthdayInput): unknown[] {
  return [
    b.companyId,
    b.active,
    b.recipientName,
    b.recipientCompany,
    b.day,
    b.month,
    b.addressKind,
    b.address,
    b.postalCode,
    b.deliveryNotes,
    b.cakeId,
    b.size,
    b.cakeText,
    b.cardMessage,
    b.signOff,
    b.timeSlot,
  ];
}

/** A pasted list goes in whole or not at all. */
export async function insertBirthdays(list: readonly BirthdayInput[]): Promise<number> {
  if (list.length === 0) return 0;
  await getDb().transaction(async (tx) => {
    for (const b of list) await tx.query(INSERT_BIRTHDAY, birthdayParams(b));
  });
  return list.length;
}

export async function updateBirthday(id: number, input: Omit<BirthdayInput, 'companyId' | 'active'>): Promise<boolean> {
  const { rowCount } = await getDb().query(
    `update birthdays
        set recipient_name = $2, recipient_company = $3, birth_day = $4, birth_month = $5, address_kind = $6,
            address = $7, postal_code = $8, delivery_notes = $9, cake_id = $10, size = $11, cake_text = $12,
            card_message = $13, sign_off = $14, time_slot = $15, updated_at = now()
      where id = $1`,
    [
      id,
      input.recipientName,
      input.recipientCompany,
      input.day,
      input.month,
      input.addressKind,
      input.address,
      input.postalCode,
      input.deliveryNotes,
      input.cakeId,
      input.size,
      input.cakeText,
      input.cardMessage,
      input.signOff,
      input.timeSlot,
    ],
  );
  return rowCount === 1;
}

export async function setBirthdayActive(id: number, active: boolean): Promise<boolean> {
  const { rowCount } = await getDb().query('update birthdays set active = $2, updated_at = now() where id = $1', [id, active]);
  return rowCount === 1;
}

export async function deleteBirthday(id: number): Promise<boolean> {
  const { rowCount } = await getDb().query('delete from birthdays where id = $1', [id]);
  return rowCount === 1;
}

// ---------------------------------------------------------------------------
// The orders birthdays have made
// ---------------------------------------------------------------------------

export interface BirthdayOrderRef {
  orderId: number;
  birthdayId: number;
  year: number;
  deliverOn: string;
  status: OrderStatus;
}

/** Every order made for these people, to show "this year's" next to each one. */
export async function birthdayOrders(birthdayIds: readonly number[]): Promise<BirthdayOrderRef[]> {
  if (birthdayIds.length === 0) return [];
  const { rows } = await getDb().query<{ id: number; birthday_id: number; birthday_year: number; deliver_on: string; status: OrderStatus }>(
    `select id, birthday_id, birthday_year, deliver_on, status from orders
      where birthday_id = any($1::bigint[])
      order by deliver_on desc`,
    [[...birthdayIds]],
  );
  return rows.map((r) => ({ orderId: r.id, birthdayId: r.birthday_id, year: r.birthday_year, deliverOn: r.deliver_on, status: r.status }));
}
