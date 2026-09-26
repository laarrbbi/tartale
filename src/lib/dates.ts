/**
 * Calendar days, as 'YYYY-MM-DD' strings in Europe/Madrid.
 *
 * A delivery date is a day in Alicante, not an instant. Keeping it a string
 * (never a Date) is what stops "tomorrow" becoming "today" for a server that
 * runs in UTC, and a date column from rolling back a day on the way out.
 */

const MADRID = 'Europe/Madrid';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Today in Madrid, as 'YYYY-MM-DD'. */
export function madridToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MADRID, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Calendar arithmetic, done at noon UTC so no daylight-saving change can move the day. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday, as in JavaScript. */
export function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export const WEEKDAYS = [
  { id: 1, short: 'L', label: 'lunes', plural: 'lunes' },
  { id: 2, short: 'M', label: 'martes', plural: 'martes' },
  { id: 3, short: 'X', label: 'miércoles', plural: 'miércoles' },
  { id: 4, short: 'J', label: 'jueves', plural: 'jueves' },
  { id: 5, short: 'V', label: 'viernes', plural: 'viernes' },
  { id: 6, short: 'S', label: 'sábado', plural: 'sábados' },
  { id: 0, short: 'D', label: 'domingo', plural: 'domingos' },
] as const;

/** "martes, 14 de octubre" */
export function longDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** "14 de octubre" */
export function dayMonth(day: number, month: number): string {
  return new Date(Date.UTC(2024, month - 1, day, 12)).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

export interface DeliveryRules {
  /** Days of notice: 1 means tomorrow at the earliest. */
  minNoticeDays: number;
  /** How far ahead an order can be placed. */
  maxDaysAhead: number;
  /** Weekdays with no deliveries (0 = Sunday). */
  closedWeekdays: readonly number[];
}

/** The earliest day that can be chosen, skipping closed weekdays. */
export function earliestDelivery(rules: DeliveryRules, now: Date = new Date()): string {
  let day = addDays(madridToday(now), rules.minNoticeDays);
  for (let i = 0; i < 7 && rules.closedWeekdays.includes(weekday(day)); i++) day = addDays(day, 1);
  return day;
}

export type DayProblem = 'invalid' | 'too_soon' | 'too_far' | 'closed_day';

/** Why a delivery day cannot be taken, or null if it can. */
export function checkDeliveryDay(day: string, rules: DeliveryRules, now: Date = new Date()): DayProblem | null {
  if (!isIsoDay(day)) return 'invalid';
  const today = madridToday(now);
  if (daysBetween(today, day) < rules.minNoticeDays) return 'too_soon';
  if (daysBetween(today, day) > rules.maxDaysAhead) return 'too_far';
  if (rules.closedWeekdays.includes(weekday(day))) return 'closed_day';
  return null;
}

/**
 * The next time a birthday comes round, on or after `from`. 29 February is
 * celebrated on the 28th in other years.
 */
export function nextBirthday(day: number, month: number, from: string): string {
  const year = Number(from.slice(0, 4));
  for (const y of [year, year + 1]) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const d = month === 2 && day === 29 && !leap ? 28 : day;
    const date = `${y}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (date >= from) return date;
  }
  return from;
}
