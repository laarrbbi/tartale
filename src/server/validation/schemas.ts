import { z } from 'zod';

import { LIMITS } from '@/lib/constants';
import { isIsoDay } from '@/lib/dates';
import { OCCASION_IDS, ORDER_LIMITS, SIZE_IDS, SLOT_IDS, type AddressKind } from '@/lib/orders';

/**
 * Every value that crosses a trust boundary is parsed here before it reaches
 * a service. Parsing, not just validating: the rest of the code works with
 * trimmed, narrowed, correctly typed data and never checks it again.
 */

/** Control characters are invisible in the panel but corrupt logs, CSVs and printed cards. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** One line of text: control characters out, runs of whitespace collapsed. */
export const cleanText = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max, `Máximo ${max} caracteres`));

/** Several lines (a card message): keeps line breaks, at most two in a row. */
export const cleanMultiline = (max: number) =>
  z
    .string()
    .transform((s) =>
      s
        .replace(/\r\n?/g, '\n')
        .replace(CONTROL_CHARS, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    )
    .pipe(z.string().max(max, `Máximo ${max} caracteres`));

/** Absent, null or blank all mean "nothing": JSON clients send any of the three. */
const nullishToEmpty = z
  .string()
  .nullish()
  .transform((v) => v ?? '');

export const optionalText = (max: number) =>
  nullishToEmpty.pipe(cleanText(max)).transform((v) => (v === '' ? null : v));
export const optionalMultiline = (max: number) =>
  nullishToEmpty.pipe(cleanMultiline(max)).transform((v) => (v === '' ? null : v));

export const phoneSchema = z
  .string()
  .trim()
  .max(ORDER_LIMITS.phone)
  .refine((v) => v === '' || (v.replace(/\D/g, '').length >= 9 && /^[+\d][\d\s().-]*$/.test(v)), 'Ese teléfono no parece válido');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(ORDER_LIMITS.email)
  .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Ese email no parece válido');

/**
 * Checkbox coercion. `z.coerce.boolean()` is `Boolean(value)`, so the string
 * "false" would become true; match what forms and JSON actually send.
 */
export const checkbox = z.preprocess((v) => v === true || v === 'true' || v === 'on' || v === '1' || v === 1, z.boolean());

export const enumOf = <T extends string>(values: readonly T[], message: string) =>
  z
    .string({ required_error: message, invalid_type_error: message })
    .refine((v): v is T => (values as readonly string[]).includes(v), message)
    .transform((v) => v as T);

export const idSchema = z.coerce.number().int().positive();

export const isoDaySchema = z
  .string({ required_error: 'Elige el día' })
  .trim()
  .refine(isIsoDay, 'Elige el día');

export const postcodeSchema = z
  .string({ required_error: 'Código postal de 5 cifras' })
  .trim()
  .regex(/^\d{5}$/, 'Código postal de 5 cifras');

// ---------------------------------------------------------------------------
// Public: an order from /enviar
// ---------------------------------------------------------------------------

/** The photo as a data URL, resized in the browser; its bytes are checked by the service. */
const PHOTO_MAX_CHARS = 2_100_000;

export const orderInputSchema = z.object({
  // The cake
  cakeId: idSchema,
  size: enumOf(SIZE_IDS, 'Elige el tamaño'),
  photo: z
    .string()
    .max(PHOTO_MAX_CHARS, 'La foto es demasiado grande')
    .nullish()
    .transform((v) => v || null),
  cakeText: optionalText(ORDER_LIMITS.cakeText),
  allergies: optionalText(ORDER_LIMITS.notes),

  // Who and where
  occasion: enumOf(OCCASION_IDS, 'Elige para qué es'),
  recipientName: cleanText(ORDER_LIMITS.name).pipe(z.string().min(1, '¿Para quién es?')),
  recipientCompany: optionalText(ORDER_LIMITS.company),
  addressKind: enumOf<AddressKind>(['oficina', 'casa'], 'Oficina o casa'),
  address: cleanText(ORDER_LIMITS.address).pipe(z.string().min(5, 'Necesitamos la dirección')),
  postalCode: postcodeSchema,
  deliveryNotes: optionalText(ORDER_LIMITS.notes),
  deliverOn: isoDaySchema,
  timeSlot: enumOf(SLOT_IDS, 'Elige mañana o tarde'),
  cardMessage: optionalMultiline(ORDER_LIMITS.cardMessage),
  signOff: optionalText(ORDER_LIMITS.signOff),
  anonymous: checkbox,
  recipientPhone: nullishToEmpty.pipe(phoneSchema).transform((v) => (v === '' ? null : v)),

  // Who sends it
  senderName: cleanText(ORDER_LIMITS.name).pipe(z.string().min(1, 'Tu nombre')),
  senderPhone: phoneSchema.pipe(z.string().min(1, 'Tu teléfono, para hablar de la entrega')),
  senderEmail: emailSchema.pipe(z.string().min(1, 'Tu email, para el recibo')),
  senderCompany: optionalText(ORDER_LIMITS.company),
  recipientConsent: checkbox.refine((v) => v, 'Confirma que puedes darnos sus datos para la entrega'),
  marketingOptIn: checkbox,

  // Bots: a field people never see, and the time it took to fill the form in.
  website: z.string().max(200).nullish(),
  elapsedMs: z.coerce.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(LIMITS.passwordMaxLength),
});

export const newPasswordSchema = z
  .string()
  .min(LIMITS.passwordMinLength, `Usa al menos ${LIMITS.passwordMinLength} caracteres`)
  .max(LIMITS.passwordMaxLength);

/** Euros as typed in Spain ("12,50"), to integer cents. Empty is null. */
export const eurosSchema = (max = 1000) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === '') return null;
      const normalised = v.replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
      if (!/^\d+(\.\d{1,2})?$/.test(normalised)) {
        ctx.addIssue({ code: 'custom', message: 'Escribe un importe, por ejemplo 12,50' });
        return z.NEVER;
      }
      const cents = Math.round(Number(normalised) * 100);
      if (cents > max * 100) {
        ctx.addIssue({ code: 'custom', message: `Como mucho ${max} €` });
        return z.NEVER;
      }
      return cents;
    });
