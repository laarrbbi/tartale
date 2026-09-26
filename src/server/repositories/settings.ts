import 'server-only';

import { getDb, one } from '@/server/db/pg';

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
