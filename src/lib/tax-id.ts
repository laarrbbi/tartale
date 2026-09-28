/**
 * Spanish tax ids (NIF), checked with their control character: the DNI of a
 * person, the NIE of a foreign resident, the NIF of a company or any other
 * entity (what used to be called CIF), and the K/L/M numbers the tax office
 * gives people without a DNI. Pure, so the order form can check it as the
 * customer types and the server can check it again.
 */

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const ENTITY_CONTROL_LETTERS = 'JABCDEFGHI';

/** "b-12.345.678 " → "B12345678": no spaces, dots, dashes or slashes; capitals. */
export function normalizeTaxId(value: string): string {
  return value.toUpperCase().replace(/[\s.\-/]/g, '');
}

export type TaxIdKind = 'dni' | 'nie' | 'entidad' | 'especial';

function personLetterOk(digits: string, letter: string): boolean {
  return DNI_LETTERS[Number(digits) % 23] === letter;
}

/**
 * The control character of an entity's NIF, from its seven digits: the
 * digits in even places are added as they are, those in odd places doubled
 * (adding the two digits of the result); the control is what takes the sum
 * to the next ten, as a digit or as a letter of JABCDEFGHI.
 */
function entityControl(digits: string): { digit: string; letter: string } {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(digits[i]);
    if (i % 2 === 1) sum += d;
    else sum += Math.floor((d * 2) / 10) + ((d * 2) % 10);
  }
  const control = (10 - (sum % 10)) % 10;
  return { digit: String(control), letter: ENTITY_CONTROL_LETTERS[control]! };
}

/** What kind of valid id it is, or null if it is not a valid Spanish NIF. */
export function taxIdKind(raw: string): TaxIdKind | null {
  const id = normalizeTaxId(raw);
  if (/^\d{8}[A-Z]$/.test(id)) return personLetterOk(id.slice(0, 8), id[8]!) ? 'dni' : null;
  if (/^[XYZ]\d{7}[A-Z]$/.test(id)) {
    const digits = String('XYZ'.indexOf(id[0]!)) + id.slice(1, 8);
    return personLetterOk(digits, id[8]!) ? 'nie' : null;
  }
  if (/^[KLM]\d{7}[A-Z]$/.test(id)) return personLetterOk(id.slice(1, 8), id[8]!) ? 'especial' : null;
  const entity = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(id);
  if (entity) {
    const [, first, digits, check] = entity as unknown as [string, string, string, string];
    const { digit, letter } = entityControl(digits);
    // Companies (A, B), community of goods (E) and owners' associations (H)
    // end in a digit; public bodies, foreign entities and the like (N, P, Q,
    // R, S, W) in a letter; the rest may use either.
    if ('ABEH'.includes(first)) return check === digit ? 'entidad' : null;
    if ('NPQRSW'.includes(first)) return check === letter ? 'entidad' : null;
    return check === digit || check === letter ? 'entidad' : null;
  }
  return null;
}

export function isValidTaxId(raw: string): boolean {
  return taxIdKind(raw) !== null;
}
