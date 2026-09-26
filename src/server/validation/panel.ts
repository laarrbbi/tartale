import { z } from 'zod';

import { CAKE_PHOTO_PATHS } from '@/lib/cake-photos';
import { ORDER_LIMITS, SIZE_IDS, type CakeSize } from '@/lib/orders';
import { normalizeWhatsappNumber } from '@/lib/whatsapp';
import { parsePostcodes } from '@/lib/zones';
import type { Role } from '@/types/domain';

import { checkbox, cleanText, emailSchema, enumOf, eurosSchema, idSchema, optionalMultiline, optionalText, phoneSchema } from './schemas';

/**
 * What the owner types in the panel. Trusted people, but still untrusted
 * input: the same parsing as the public form, so a slip of the keyboard
 * cannot put a broken postcode or a negative price in the database.
 */

const optionalPhone = z
  .string()
  .nullish()
  .transform((v) => v ?? '')
  .pipe(phoneSchema)
  .transform((v) => (v === '' ? null : v));

const optionalEmail = z
  .string()
  .nullish()
  .transform((v) => v ?? '')
  .pipe(emailSchema)
  .transform((v) => (v === '' ? null : v));

const requiredText = (max: number, message: string) => cleanText(max).pipe(z.string().min(1, message));

/** A price in euros that has to be there ("0" is a price; blank is not). */
const requiredEuros = (max: number) =>
  eurosSchema(max).refine((v): v is number => v !== null, 'Escribe un importe, por ejemplo 10').transform((v) => v!);

// ---------------------------------------------------------------------------
// Bakeries, zones, cakes
// ---------------------------------------------------------------------------

export const bakerySchema = z.object({
  name: requiredText(80, 'El nombre de la pastelería'),
  city: requiredText(60, 'La ciudad'),
  address: optionalText(ORDER_LIMITS.address),
  contactName: optionalText(ORDER_LIMITS.name),
  phone: optionalPhone,
  whatsapp: optionalPhone.refine((v) => v === null || normalizeWhatsappNumber(v) !== null, 'Ese número no sirve para WhatsApp'),
  email: optionalEmail,
  printsPhotos: checkbox,
  active: checkbox,
  notePequena: optionalText(60),
  noteMediana: optionalText(60),
  noteGrande: optionalText(60),
  notes: optionalMultiline(500),
});
export type BakeryForm = z.infer<typeof bakerySchema>;

export const newBakerySchema = z.object({
  name: requiredText(80, 'El nombre de la pastelería'),
  city: requiredText(60, 'La ciudad'),
});

/** "03001–03016, 03540" → every code; a piece that is not a postcode is an error, not a silent skip. */
const postcodeList = z
  .string()
  .max(3000, 'Demasiado largo')
  .transform((text, ctx) => {
    const { codes, bad } = parsePostcodes(text);
    if (bad.length > 0) {
      ctx.addIssue({ code: 'custom', message: `No se entiende: ${bad.slice(0, 5).join(', ')}` });
      return z.NEVER;
    }
    if (codes.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Escribe al menos un código postal' });
      return z.NEVER;
    }
    return codes;
  });

export const zoneSchema = z.object({
  id: idSchema.optional(),
  bakeryId: idSchema,
  name: requiredText(60, 'Un nombre para la zona'),
  city: requiredText(60, 'La ciudad'),
  postalCodes: postcodeList,
  deliveryEuros: requiredEuros(200),
  active: checkbox,
});

const PRICE_FIELDS: Record<CakeSize, 'pricePequena' | 'priceMediana' | 'priceGrande'> = {
  pequena: 'pricePequena',
  mediana: 'priceMediana',
  grande: 'priceGrande',
};

export const cakeSchema = z
  .object({
    id: idSchema.optional(),
    bakeryId: idSchema,
    name: cleanText(60).pipe(z.string().min(2, 'El nombre de la tarta')),
    description: optionalText(200),
    photo: z
      .string()
      .nullish()
      .transform((v) => v || null)
      .refine((v) => v === null || CAKE_PHOTO_PATHS.includes(v), 'Elige una de las fotos'),
    pricePequena: eurosSchema(1000),
    priceMediana: eurosSchema(1000),
    priceGrande: eurosSchema(1000),
    active: checkbox,
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  })
  .superRefine((cake, ctx) => {
    if (SIZE_IDS.every((size) => cake[PRICE_FIELDS[size]] === null)) {
      ctx.addIssue({ code: 'custom', path: ['priceMediana'], message: 'Pon el precio de al menos un tamaño' });
    }
  });

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settingsSchema = z
  .object({
    ordersEnabled: checkbox,
    minNoticeDays: z.coerce.number({ invalid_type_error: 'Un número de días' }).int().min(0, 'Mínimo 0').max(30, 'Máximo 30'),
    maxDaysAhead: z.coerce.number({ invalid_type_error: 'Un número de días' }).int().min(7, 'Mínimo 7').max(730, 'Máximo 730'),
    closedWeekdays: z.array(z.coerce.number().int().min(0).max(6)).transform((days) => [...new Set(days)].sort()),
    whatsappNumber: optionalPhone.refine((v) => v === null || normalizeWhatsappNumber(v) !== null, 'Ese número no sirve para WhatsApp'),
  })
  .superRefine((s, ctx) => {
    if (s.maxDaysAhead <= s.minNoticeDays) {
      ctx.addIssue({ code: 'custom', path: ['maxDaysAhead'], message: 'Tiene que ser más que la antelación mínima' });
    }
    if (s.closedWeekdays.length >= 7) {
      ctx.addIssue({ code: 'custom', path: ['closedWeekdays'], message: 'Tiene que quedar al menos un día de reparto' });
    }
  });

export const deliveryPriceSchema = requiredEuros(200);

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export const newAccountSchema = z.object({
  displayName: requiredText(80, 'Su nombre'),
  email: emailSchema.pipe(z.string().min(1, 'Su email')),
  role: enumOf<Role>(['owner', 'staff'], 'Elige el papel'),
});
