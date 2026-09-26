import 'server-only';

import type { SizeNotes } from '@/lib/catalog-types';
import type { SizePrices } from '@/lib/orders';
import { getDb, isoRequired, one } from '@/server/db/pg';

// ---------------------------------------------------------------------------
// Bakeries
// ---------------------------------------------------------------------------

export type { SizeNotes };

export interface Bakery {
  id: number;
  slug: string;
  name: string;
  city: string;
  address: string | null;
  contactName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  printsPhotos: boolean;
  active: boolean;
  sizeNotes: SizeNotes;
  notes: string | null;
  createdAt: string;
}

interface BakeryRow {
  id: number;
  slug: string;
  name: string;
  city: string;
  address: string | null;
  contact_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  prints_photos: boolean;
  active: boolean;
  size_notes: SizeNotes | null;
  notes: string | null;
  created_at: Date;
}

const BAKERY_COLUMNS = `id, slug, name, city, address, contact_name, phone, whatsapp, email, prints_photos,
  active, size_notes, notes, created_at`;

function toBakery(r: BakeryRow): Bakery {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    address: r.address,
    contactName: r.contact_name,
    phone: r.phone,
    whatsapp: r.whatsapp,
    email: r.email,
    printsPhotos: r.prints_photos,
    active: r.active,
    sizeNotes: r.size_notes ?? {},
    notes: r.notes,
    createdAt: isoRequired(r.created_at),
  };
}

export async function listBakeries(): Promise<Bakery[]> {
  const { rows } = await getDb().query<BakeryRow>(`select ${BAKERY_COLUMNS} from bakeries order by active desc, name`);
  return rows.map(toBakery);
}

export async function findBakery(id: number): Promise<Bakery | null> {
  const row = await one<BakeryRow>(getDb(), `select ${BAKERY_COLUMNS} from bakeries where id = $1`, [id]);
  return row ? toBakery(row) : null;
}

export type BakeryInput = Omit<Bakery, 'id' | 'createdAt'>;

export async function insertBakery(input: BakeryInput): Promise<number | null> {
  const row = await one<{ id: number }>(
    getDb(),
    `insert into bakeries (slug, name, city, address, contact_name, phone, whatsapp, email, prints_photos, active, size_notes, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
     on conflict (slug) do nothing
     returning id`,
    [
      input.slug,
      input.name,
      input.city,
      input.address,
      input.contactName,
      input.phone,
      input.whatsapp,
      input.email,
      input.printsPhotos,
      input.active,
      JSON.stringify(input.sizeNotes),
      input.notes,
    ],
  );
  return row?.id ?? null;
}

export async function updateBakery(id: number, input: Omit<BakeryInput, 'slug'>): Promise<void> {
  await getDb().query(
    `update bakeries
        set name = $2, city = $3, address = $4, contact_name = $5, phone = $6, whatsapp = $7, email = $8,
            prints_photos = $9, active = $10, size_notes = $11::jsonb, notes = $12, updated_at = now()
      where id = $1`,
    [
      id,
      input.name,
      input.city,
      input.address,
      input.contactName,
      input.phone,
      input.whatsapp,
      input.email,
      input.printsPhotos,
      input.active,
      JSON.stringify(input.sizeNotes),
      input.notes,
    ],
  );
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export interface Zone {
  id: number;
  bakeryId: number;
  name: string;
  city: string;
  postalCodes: string[];
  deliveryCents: number;
  active: boolean;
}

interface ZoneRow {
  id: number;
  bakery_id: number;
  name: string;
  city: string;
  postal_codes: string[];
  delivery_cents: number;
  active: boolean;
}

function toZone(r: ZoneRow): Zone {
  return {
    id: r.id,
    bakeryId: r.bakery_id,
    name: r.name,
    city: r.city,
    postalCodes: r.postal_codes ?? [],
    deliveryCents: r.delivery_cents,
    active: r.active,
  };
}

const ZONE_COLUMNS = 'id, bakery_id, name, city, postal_codes, delivery_cents, active';

export async function listZones(options: { bakeryId?: number } = {}): Promise<Zone[]> {
  const { rows } = await getDb().query<ZoneRow>(
    `select ${ZONE_COLUMNS} from zones where ($1::bigint is null or bakery_id = $1) order by active desc, city, name, id`,
    [options.bakeryId ?? null],
  );
  return rows.map(toZone);
}

export async function findZone(id: number): Promise<Zone | null> {
  const row = await one<ZoneRow>(getDb(), `select ${ZONE_COLUMNS} from zones where id = $1`, [id]);
  return row ? toZone(row) : null;
}

/** The active zone (and so the bakery) that delivers to a postcode. */
export async function zoneForPostcode(postcode: string): Promise<Zone | null> {
  const row = await one<ZoneRow>(
    getDb(),
    `select z.id, z.bakery_id, z.name, z.city, z.postal_codes, z.delivery_cents, z.active
       from zones z join bakeries b on b.id = z.bakery_id
      where z.active and b.active and $1 = any(z.postal_codes)
      order by z.id limit 1`,
    [postcode],
  );
  return row ? toZone(row) : null;
}

export type ZoneInput = Omit<Zone, 'id'>;

export async function insertZone(input: ZoneInput): Promise<number> {
  const row = await one<{ id: number }>(
    getDb(),
    `insert into zones (bakery_id, name, city, postal_codes, delivery_cents, active)
     values ($1, $2, $3, $4::text[], $5, $6) returning id`,
    [input.bakeryId, input.name, input.city, input.postalCodes, input.deliveryCents, input.active],
  );
  return row!.id;
}

export async function updateZone(id: number, input: Omit<ZoneInput, 'bakeryId'>): Promise<void> {
  await getDb().query(
    `update zones set name = $2, city = $3, postal_codes = $4::text[], delivery_cents = $5, active = $6, updated_at = now()
      where id = $1`,
    [id, input.name, input.city, input.postalCodes, input.deliveryCents, input.active],
  );
}

export async function setZoneDelivery(id: number, deliveryCents: number): Promise<void> {
  await getDb().query('update zones set delivery_cents = $2, updated_at = now() where id = $1', [id, deliveryCents]);
}

// ---------------------------------------------------------------------------
// Cakes (each bakery's menu)
// ---------------------------------------------------------------------------

export interface Cake {
  id: number;
  bakeryId: number;
  name: string;
  description: string | null;
  photo: string | null;
  prices: SizePrices;
  active: boolean;
  sortOrder: number;
}

interface CakeRow {
  id: number;
  bakery_id: number;
  name: string;
  description: string | null;
  photo: string | null;
  price_pequena_cents: number | null;
  price_mediana_cents: number | null;
  price_grande_cents: number | null;
  active: boolean;
  sort_order: number;
}

function toCake(r: CakeRow): Cake {
  return {
    id: r.id,
    bakeryId: r.bakery_id,
    name: r.name,
    description: r.description,
    photo: r.photo,
    prices: { pequena: r.price_pequena_cents, mediana: r.price_mediana_cents, grande: r.price_grande_cents },
    active: r.active,
    sortOrder: r.sort_order,
  };
}

const CAKE_COLUMNS = `id, bakery_id, name, description, photo, price_pequena_cents, price_mediana_cents,
  price_grande_cents, active, sort_order`;

export async function listCakes(options: { bakeryId?: number; activeOnly?: boolean } = {}): Promise<Cake[]> {
  const { rows } = await getDb().query<CakeRow>(
    `select ${CAKE_COLUMNS} from cakes
      where ($1::bigint is null or bakery_id = $1) and (not $2 or active)
      order by sort_order, name`,
    [options.bakeryId ?? null, options.activeOnly ?? false],
  );
  return rows.map(toCake);
}

export async function findCake(id: number): Promise<Cake | null> {
  const row = await one<CakeRow>(getDb(), `select ${CAKE_COLUMNS} from cakes where id = $1`, [id]);
  return row ? toCake(row) : null;
}

export type CakeInput = Omit<Cake, 'id'>;

export async function insertCake(input: CakeInput): Promise<number | null> {
  const row = await one<{ id: number }>(
    getDb(),
    `insert into cakes (bakery_id, name, description, photo, price_pequena_cents, price_mediana_cents,
                        price_grande_cents, active, sort_order)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (bakery_id, lower(name)) do nothing
     returning id`,
    [
      input.bakeryId,
      input.name,
      input.description,
      input.photo,
      input.prices.pequena,
      input.prices.mediana,
      input.prices.grande,
      input.active,
      input.sortOrder,
    ],
  );
  return row?.id ?? null;
}

export async function updateCake(id: number, input: Omit<CakeInput, 'bakeryId'>): Promise<boolean> {
  const { rowCount } = await getDb().query(
    `update cakes
        set name = $2, description = $3, photo = $4, price_pequena_cents = $5, price_mediana_cents = $6,
            price_grande_cents = $7, active = $8, sort_order = $9, updated_at = now()
      where id = $1
        and not exists (select 1 from cakes c2 where c2.bakery_id = cakes.bakery_id and c2.id <> $1
                        and lower(c2.name) = lower($2))`,
    [
      id,
      input.name,
      input.description,
      input.photo,
      input.prices.pequena,
      input.prices.mediana,
      input.prices.grande,
      input.active,
      input.sortOrder,
    ],
  );
  return rowCount === 1;
}
