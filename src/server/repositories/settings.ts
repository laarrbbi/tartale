import 'server-only';

import { getDb, one, type Db } from '@/server/db/pg';

export interface Settings {
  /** The main switch: off, the order form says so and the API refuses orders. */
  ordersEnabled: boolean;
  minNoticeDays: number;
  maxDaysAhead: number;
  /** Weekdays with no deliveries (0 = Sunday). */
  closedWeekdays: number[];
  /** Tartale's own WhatsApp, for the "¿Algún cambio?" link. Empty: the link is hidden. */
  whatsappNumber: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  ordersEnabled: true,
  minNoticeDays: 1,
  maxDaysAhead: 365,
  closedWeekdays: [],
  whatsappNumber: null,
};

interface SettingsRow {
  orders_enabled: boolean;
  min_notice_days: number;
  max_days_ahead: number;
  closed_weekdays: number[] | null;
  whatsapp_number: string | null;
}

export async function getSettings(): Promise<Settings> {
  const row = await one<SettingsRow>(
    getDb(),
    'select orders_enabled, min_notice_days, max_days_ahead, closed_weekdays, whatsapp_number from settings where id = 1',
  );
  if (!row) return DEFAULT_SETTINGS;
  return {
    ordersEnabled: row.orders_enabled,
    minNoticeDays: row.min_notice_days,
    maxDaysAhead: row.max_days_ahead,
    closedWeekdays: (row.closed_weekdays ?? []).map(Number),
    whatsappNumber: row.whatsapp_number,
  };
}

export async function saveSettings(input: Settings): Promise<void> {
  await getDb().query(
    `insert into settings (id, orders_enabled, min_notice_days, max_days_ahead, closed_weekdays, whatsapp_number, updated_at)
     values (1, $1, $2, $3, $4::smallint[], $5, now())
     on conflict (id) do update
        set orders_enabled = excluded.orders_enabled, min_notice_days = excluded.min_notice_days,
            max_days_ahead = excluded.max_days_ahead, closed_weekdays = excluded.closed_weekdays,
            whatsapp_number = excluded.whatsapp_number, updated_at = now()`,
    [input.ordersEnabled, input.minNoticeDays, input.maxDaysAhead, input.closedWeekdays, input.whatsappNumber],
  );
}

// ---------------------------------------------------------------------------
// Tartale's own details: the legal pages and every invoice print them
// ---------------------------------------------------------------------------

export interface Business {
  /** Razón social, or the trader's full name. */
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  /** Where people write about their data, the site and their invoices. */
  email: string | null;
  /** Registro Mercantil entry, when it is a company. */
  registry: string | null;
  /** The VAT rate of what we sell, in basis points (1000 = 10 %). Null: not set, no invoices. */
  vatRateBp: number | null;
  /** At the foot of invoices paid by transfer: the account and the terms. */
  invoiceNote: string | null;
}

export const EMPTY_BUSINESS: Business = {
  legalName: null,
  taxId: null,
  address: null,
  postalCode: null,
  city: null,
  email: null,
  registry: null,
  vatRateBp: null,
  invoiceNote: null,
};

interface BusinessRow {
  legal_name: string | null;
  tax_id: string | null;
  legal_address: string | null;
  legal_postal_code: string | null;
  legal_city: string | null;
  legal_email: string | null;
  legal_registry: string | null;
  vat_rate_bp: number | null;
  invoice_note: string | null;
}

export async function getBusiness(db: Db = getDb()): Promise<Business> {
  const row = await one<BusinessRow>(
    db,
    `select legal_name, tax_id, legal_address, legal_postal_code, legal_city, legal_email, legal_registry,
            vat_rate_bp, invoice_note
       from settings where id = 1`,
  );
  if (!row) return EMPTY_BUSINESS;
  return {
    legalName: row.legal_name,
    taxId: row.tax_id,
    address: row.legal_address,
    postalCode: row.legal_postal_code,
    city: row.legal_city,
    email: row.legal_email,
    registry: row.legal_registry,
    vatRateBp: row.vat_rate_bp,
    invoiceNote: row.invoice_note,
  };
}

export async function saveBusiness(input: Business): Promise<void> {
  await getDb().query(
    `insert into settings (id, legal_name, tax_id, legal_address, legal_postal_code, legal_city, legal_email,
                           legal_registry, vat_rate_bp, invoice_note, updated_at)
     values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (id) do update
        set legal_name = excluded.legal_name, tax_id = excluded.tax_id, legal_address = excluded.legal_address,
            legal_postal_code = excluded.legal_postal_code, legal_city = excluded.legal_city,
            legal_email = excluded.legal_email, legal_registry = excluded.legal_registry,
            vat_rate_bp = excluded.vat_rate_bp, invoice_note = excluded.invoice_note, updated_at = now()`,
    [
      input.legalName,
      input.taxId,
      input.address,
      input.postalCode,
      input.city,
      input.email,
      input.registry,
      input.vatRateBp,
      input.invoiceNote,
    ],
  );
}
