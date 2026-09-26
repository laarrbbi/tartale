import { addDays, weekday } from './dates';
import { ORDER_LIMITS, type AddressKind } from './orders';
import { isPostcode } from './zones';

/**
 * Company birthdays: a team list pasted from a spreadsheet, one person per
 * line — "Nombre; dd/mm; Empresa; Dirección; CP". Excel copies cells with
 * tabs, and keeps empty cells, so the columns are read by position; `;` works
 * too for people typing by hand. Company, address and postcode may be left
 * empty when they are the ones given for the whole list.
 */
export interface BirthdayLine {
  name: string;
  day: number;
  month: number;
  company: string | null;
  address: string | null;
  postalCode: string | null;
}

/** Orders for automatic birthdays are created this many days ahead. */
export const BIRTHDAY_LEAD_DAYS = 7;

const DATE = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?$/;

function daysInMonth(month: number): number {
  // A leap year, so 29/02 is accepted; see nextBirthday for other years.
  return new Date(Date.UTC(2024, month, 0)).getUTCDate();
}

export function parseBirthdayList(text: string): { ok: BirthdayLine[]; bad: string[] } {
  const ok: BirthdayLine[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\t|;/).map((p) => p.trim());
    const name = (parts[0] ?? '').replace(/\s+/g, ' ').slice(0, ORDER_LIMITS.name);
    const date = DATE.exec(parts[1] ?? '');
    const day = date ? Number(date[1]) : 0;
    const month = date ? Number(date[2]) : 0;
    if (!name || month < 1 || month > 12 || day < 1 || day > daysInMonth(month)) {
      bad.push(line);
      continue;
    }
    let company = parts[2] || null;
    let address = parts[3] || null;
    let postalCode = parts[4] || null;
    // "Nombre; dd/mm; Dirección; CP" — a postcode in the fourth column and
    // nothing after it: the company was left out.
    if (!postalCode && address && isPostcode(address) && parts.length === 4) {
      postalCode = address;
      address = company;
      company = null;
    }
    if (postalCode && !isPostcode(postalCode)) {
      bad.push(line);
      continue;
    }
    ok.push({
      name,
      day,
      month,
      company: company?.slice(0, ORDER_LIMITS.company) ?? null,
      address: address?.slice(0, ORDER_LIMITS.address) ?? null,
      postalCode,
    });
  }
  return { ok, bad };
}

/** "¡Feliz cumple, {nombre}!" with the person's first name. */
export function fillName(template: string | null, fullName: string): string | null {
  if (!template) return null;
  const first = fullName.trim().split(/\s+/)[0] ?? fullName;
  return template.replace(/\{nombre\}/gi, first);
}

/**
 * The day the cake goes out for a birthday on `birthday`.
 *
 * An office is closed at the weekend, so a Saturday or Sunday birthday at the
 * office is celebrated on the Friday before. A weekday with no deliveries
 * moves the cake to the day before, never after: late for a birthday is worse
 * than early.
 */
export function birthdayDeliveryDay(birthday: string, addressKind: AddressKind, closedWeekdays: readonly number[]): string {
  const unavailable = (day: string) => {
    const w = weekday(day);
    return closedWeekdays.includes(w) || (addressKind === 'oficina' && (w === 0 || w === 6));
  };
  let day = birthday;
  for (let i = 0; i < 7 && unavailable(day); i++) day = addDays(day, -1);
  // Nothing open all week: leave it on the day and let the team decide.
  return unavailable(day) ? birthday : day;
}
