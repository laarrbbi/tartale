'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { CakePreview } from '@/components/cake/cake-preview';
import { CardPreview } from '@/components/card/card-preview';
import { BoxPreview } from '@/components/order/box-preview';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { CARD_DESIGNS, CARD_DESIGN_IDS, ORDER_DOCUMENT, type CardDesign } from '@/lib/cards';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { longDate, weekday, WEEKDAYS } from '@/lib/dates';
import {
  CAKE_TEXT_IDEAS,
  OCCASIONS,
  OCCASION_IDS,
  ORDER_LIMITS,
  ORDER_PHOTO,
  SIZES,
  SIZE_IDS,
  SLOTS,
  SLOT_IDS,
  formatEuros,
  fromPrice,
  priceFor,
  type AddressKind,
  type CakeSize,
  type Occasion,
  type TimeSlot,
} from '@/lib/orders';
import { formatPostcodes } from '@/lib/zones';
import type { PublicMenu } from '@/lib/catalog-types';

/** The document for the box, read in the browser; the server checks its bytes again. */
type DocumentFile = { name: string; size: number; data: string };

type Values = {
  occasion: Occasion;
  recipientName: string;
  recipientCompany: string;
  addressKind: AddressKind;
  address: string;
  postalCode: string;
  deliveryNotes: string;
  recipientPhone: string;
  deliverOn: string;
  timeSlot: TimeSlot;
  cakeId: number;
  size: CakeSize;
  allergies: string;
  photo: string;
  cakeText: string;
  cardDesign: CardDesign;
  cardMessage: string;
  signOff: string;
  anonymous: boolean;
  document: DocumentFile | null;
  senderName: string;
  senderPhone: string;
  senderEmail: string;
  senderCompany: string;
  recipientConsent: boolean;
  marketingOptIn: boolean;
};

/** Who and where (and which cake, and its price), then how it looks, then review and pay. */
const STEPS = ['Destinatario', 'Diseño', 'Revisar y pagar'] as const;

/** Which step a field lives on, to jump back to it when the server objects. */
const FIELD_STEP: Record<string, number> = {
  occasion: 0, recipientName: 0, recipientCompany: 0, addressKind: 0, address: 0, postalCode: 0, deliveryNotes: 0,
  recipientPhone: 0, deliverOn: 0, timeSlot: 0, cakeId: 0, size: 0, allergies: 0,
  photo: 1, cakeText: 1, cardDesign: 1, cardMessage: 1, signOff: 1, anonymous: 1, document: 1,
  senderName: 2, senderPhone: 2, senderEmail: 2, senderCompany: 2, recipientConsent: 2,
};

/**
 * The photo, made small enough to send: longest side 1600 px, JPEG on white
 * (a transparent logo prints on the cake's white, not on black). The server
 * checks the bytes again; this only keeps uploads light on a phone connection.
 */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, ORDER_PHOTO.maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.75, 0.62, 0.5]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length * 0.75 < ORDER_PHOTO.maxBytes * 0.92) return data;
    }
    throw new Error('too big');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The file as a data URL, the way the order is sent (JSON). */
function readDocument(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const DOCUMENT_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

const choice =
  'pressable cursor-pointer rounded-field ring-1 ring-line-strong bg-surface transition-colors ' +
  'has-[:checked]:bg-brand-soft has-[:checked]:ring-2 has-[:checked]:ring-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand';

const fileButton =
  'pressable inline-flex h-11 w-fit cursor-pointer items-center rounded-pill bg-surface px-5 text-[0.9375rem] font-semibold text-ink ' +
  'ring-1 ring-line-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand';

export function OrderFlow({
  menu,
  earliest,
  latest,
  closedWeekdays,
  initialPostcode = '',
}: {
  menu: PublicMenu;
  earliest: string;
  latest: string;
  closedWeekdays: number[];
  initialPostcode?: string;
}) {
  const firstCake = menu.cakes.find((c) => priceFor(c.prices, 'mediana') !== null) ?? menu.cakes[0]!;
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({
    occasion: 'networking',
    recipientName: '',
    recipientCompany: '',
    addressKind: 'oficina',
    address: '',
    postalCode: initialPostcode,
    deliveryNotes: '',
    recipientPhone: '',
    deliverOn: earliest,
    timeSlot: 'manana',
    cakeId: firstCake.id,
    size: priceFor(firstCake.prices, 'mediana') !== null ? 'mediana' : SIZE_IDS.find((s) => priceFor(firstCake.prices, s) !== null)!,
    allergies: '',
    photo: '',
    cakeText: '',
    cardDesign: 'clasica',
    cardMessage: OCCASIONS.networking.card,
    signOff: '',
    anonymous: false,
    document: null,
    senderName: '',
    senderPhone: '',
    senderEmail: '',
    senderCompany: '',
    recipientConsent: false,
    marketingOptIn: false,
  });
  const [cardTouched, setCardTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const startedAt = useRef(Date.now());
  const stepRef = useRef<HTMLDivElement>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const cake = menu.cakes.find((c) => c.id === values.cakeId) ?? firstCake;
  const price = priceFor(cake.prices, values.size);
  const allCodes = useMemo(() => [...new Set(menu.zones.flatMap((z) => z.postalCodes))], [menu.zones]);
  const code = values.postalCode.trim();
  const zone = menu.zones.find((z) => z.postalCodes.includes(code)) ?? null;
  const deliveryCents = zone?.deliveryCents ?? (menu.zones.length === 1 ? menu.zones[0]!.deliveryCents : null);
  const total = price !== null && deliveryCents !== null ? price + deliveryCents : null;
  const deliveryOptions = [...new Set(menu.zones.map((z) => z.deliveryCents))];
  const busy = photoBusy || docBusy;

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const text = (key: keyof Values) => ({
    id: key,
    name: key,
    value: values[key] as string,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never),
  });

  function chooseCake(id: number) {
    const next = menu.cakes.find((c) => c.id === id);
    if (!next) return;
    setValues((v) => ({
      ...v,
      cakeId: id,
      size: priceFor(next.prices, v.size) !== null ? v.size : SIZE_IDS.find((s) => priceFor(next.prices, s) !== null)!,
    }));
  }

  function chooseOccasion(occasion: Occasion) {
    setValues((v) => ({ ...v, occasion, cardMessage: cardTouched ? v.cardMessage : OCCASIONS[occasion].card }));
  }

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors((x) => ({ ...x, photo: 'Tiene que ser una imagen (JPG o PNG).' }));
      return;
    }
    setPhotoBusy(true);
    try {
      set('photo', await shrink(file));
    } catch {
      setErrors((x) => ({ ...x, photo: 'No hemos podido leer esa foto. Prueba con otra (JPG o PNG).' }));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onDocument(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(ORDER_DOCUMENT.types as readonly string[]).includes(file.type) && !DOCUMENT_EXTENSIONS.test(file.name)) {
      setErrors((x) => ({ ...x, document: 'Tiene que ser un PDF, JPG o PNG.' }));
      return;
    }
    if (file.size > ORDER_DOCUMENT.maxBytes) {
      setErrors((x) => ({ ...x, document: `Pesa ${formatBytes(file.size)}: como mucho ${formatBytes(ORDER_DOCUMENT.maxBytes)}.` }));
      return;
    }
    setDocBusy(true);
    try {
      set('document', { name: file.name, size: file.size, data: await readDocument(file) });
    } catch {
      setErrors((x) => ({ ...x, document: 'No hemos podido leer ese archivo. Prueba con otro.' }));
    } finally {
      setDocBusy(false);
    }
  }

  /** The checks the browser cannot do by itself, per step. */
  function customErrors(forStep: number): Record<string, string> {
    const found: Record<string, string> = {};
    if (forStep !== 0) return found;
    if (/^\d{5}$/.test(code) && !zone) found.postalCode = `Todavía no llegamos ahí. Entregamos en ${formatPostcodes(allCodes)}.`;
    if (values.deliverOn && closedWeekdays.includes(weekday(values.deliverOn))) {
      const days = WEEKDAYS.find((w) => w.id === weekday(values.deliverOn))?.plural ?? 'ese día';
      found.deliverOn = `Los ${days} no repartimos. Elige otro día.`;
    } else if (values.deliverOn && (values.deliverOn < earliest || values.deliverOn > latest)) {
      found.deliverOn = values.deliverOn < earliest ? `Lo antes posible: ${longDate(earliest)}.` : 'Ese día está demasiado lejos.';
    }
    if (price === null) found.size = 'Esta tarta no se hace en ese tamaño.';
    return found;
  }

  function validateStep(): boolean {
    const box = stepRef.current;
    const invalid = box?.querySelector<HTMLInputElement | HTMLTextAreaElement>(':invalid');
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return false;
    }
    const custom = customErrors(step);
    if (Object.keys(custom).length > 0) {
      setErrors((e) => ({ ...e, ...custom }));
      box?.querySelector<HTMLElement>(`[name="${Object.keys(custom)[0]}"]`)?.focus();
      return false;
    }
    return true;
  }

  function goTo(nextStep: number) {
    setMessage(null);
    setStep(nextStep);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateStep()) return;
    if (step < STEPS.length - 1) return goTo(step + 1);
    if (sending) return;

    setSending(true);
    setMessage(null);
    try {
      const response = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...values,
          photo: values.photo || null,
          document: values.document ? { name: values.document.name, data: values.document.data } : null,
          website: honeypotRef.current?.value ?? '',
          elapsedMs: Date.now() - startedAt.current,
        }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string; fields?: Record<string, string>; redirect?: string } | null;
      if (!response.ok || !body?.redirect) {
        const fields = body?.fields ?? {};
        setErrors(fields);
        setMessage(body?.message ?? 'No hemos podido enviar el pedido. Inténtalo otra vez.');
        const first = Object.keys(fields)
          .map((f) => FIELD_STEP[f])
          .filter((s): s is number => s !== undefined)
          .sort()[0];
        if (first !== undefined && first !== step) goTo(first);
        setSending(false);
        return;
      }
      // Stripe's payment page. On the way back the tracking page picks up.
      window.location.assign(body.redirect);
    } catch {
      setMessage('Sin conexión. Comprueba tu cobertura e inténtalo otra vez.');
      setSending(false);
    }
  }

  const error = (name: string) => errors[name];
  const cardSignOff = values.anonymous ? null : values.signOff.trim() || values.senderName.trim() || 'tu nombre';
  const box = (className?: string) => (
    <BoxPreview
      photo={values.photo || null}
      cakeText={values.cakeText}
      cardDesign={values.cardDesign}
      cardMessage={values.cardMessage}
      signOff={cardSignOff}
      to={values.recipientName}
      documentName={values.document?.name ?? null}
      className={className}
    />
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_21rem] lg:items-start xl:grid-cols-[1fr_23rem]">
      <form onSubmit={onSubmit} noValidate={false} className="flex min-w-0 flex-col gap-6" aria-label="Pedido">
        <Stepper step={step} onBack={(i) => goTo(i)} disabled={sending} />

        <div ref={stepRef} key={step} className="step-enter flex flex-col gap-7">
          {step === 0 ? (
            <>
              <h2 className="type-title text-balance">¿Quién recibe la tarta?</h2>

              <fieldset className="flex flex-col gap-2">
                <legend className="type-heading mb-2">Y por qué</legend>
                <div className="flex flex-wrap gap-2">
                  {OCCASION_IDS.map((id) => (
                    <label
                      key={id}
                      className="pressable cursor-pointer rounded-pill bg-surface px-3.5 py-2 ring-1 ring-line-strong has-[:checked]:bg-chocolate has-[:checked]:text-ink-inverse has-[:checked]:ring-chocolate has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
                    >
                      <input type="radio" name="occasion" value={id} checked={values.occasion === id} onChange={() => chooseOccasion(id)} className="sr-only" />
                      <span className="text-[0.875rem] font-medium">{OCCASIONS[id].label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Su nombre" htmlFor="recipientName" error={error('recipientName')} hint="Por quién preguntamos al llegar.">
                  <Input {...text('recipientName')} required maxLength={ORDER_LIMITS.name} autoComplete="off" />
                </Field>
                <Field label="Su empresa · opcional" htmlFor="recipientCompany" error={error('recipientCompany')}>
                  <Input {...text('recipientCompany')} maxLength={ORDER_LIMITS.company} autoComplete="off" />
                </Field>
              </div>

              <fieldset className="flex flex-col gap-4">
                <legend className="type-heading mb-2">Dónde</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(['oficina', 'casa'] as const).map((kind) => (
                    <label key={kind} className={cn(choice, 'flex items-center justify-center gap-2 py-3')}>
                      <input type="radio" name="addressKind" value={kind} checked={values.addressKind === kind} onChange={() => set('addressKind', kind)} className="sr-only" />
                      <span className="type-body font-medium">{kind === 'oficina' ? 'En su oficina' : 'En su casa'}</span>
                    </label>
                  ))}
                </div>
                <Field label="Dirección" htmlFor="address" error={error('address')}>
                  <Input {...text('address')} required minLength={5} maxLength={ORDER_LIMITS.address} autoComplete="off" placeholder="Calle, número" />
                </Field>
                <div className="grid grid-cols-[8.5rem_1fr] gap-3">
                  <Field label="C. postal" htmlFor="postalCode" error={error('postalCode')}>
                    <Input {...text('postalCode')} required inputMode="numeric" pattern="\d{5}" maxLength={5} autoComplete="off" />
                  </Field>
                  <Field label="Planta, recepción… · opcional" htmlFor="deliveryNotes" error={error('deliveryNotes')}>
                    <Input {...text('deliveryNotes')} maxLength={ORDER_LIMITS.notes} autoComplete="off" />
                  </Field>
                </div>
                {error('postalCode') ? null : zone ? (
                  <p className="type-caption -mt-2 flex items-center gap-2 text-positive" role="status">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-positive" />
                    Llegamos. La hace {menu.bakery.name}, en {zone.city}.
                  </p>
                ) : allCodes.length > 0 ? (
                  <p className="type-caption -mt-2">
                    {menu.city}: {formatPostcodes(allCodes)}.{' '}
                    <Link href="/zonas" target="_blank" className="underline underline-offset-2">
                      Dónde entregamos
                    </Link>
                  </p>
                ) : null}
                <Field
                  label="Su teléfono · opcional"
                  htmlFor="recipientPhone"
                  error={error('recipientPhone')}
                  hint="Solo para la entrega, por si hace falta avisar en la puerta. Nunca le escribimos por otra cosa."
                >
                  <Input {...text('recipientPhone')} type="tel" inputMode="tel" autoComplete="off" />
                </Field>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="type-heading mb-2">Cuándo</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Día"
                    htmlFor="deliverOn"
                    error={error('deliverOn')}
                    hint={
                      values.deliverOn
                        ? values.addressKind === 'oficina' && [0, 6].includes(weekday(values.deliverOn))
                          ? `${longDate(values.deliverOn)}. Ojo: es fin de semana; asegúrate de que la oficina esté abierta.`
                          : longDate(values.deliverOn)
                        : undefined
                    }
                  >
                    <Input {...text('deliverOn')} type="date" required min={earliest} max={latest} />
                  </Field>
                  <div className="flex flex-col gap-2" role="radiogroup" aria-label="Franja">
                    {SLOT_IDS.map((slot) => (
                      <label key={slot} className={cn(choice, 'flex items-center justify-between gap-2 px-3.5 py-2.5')}>
                        <input type="radio" name="timeSlot" value={slot} checked={values.timeSlot === slot} onChange={() => set('timeSlot', slot)} className="sr-only" />
                        <span className="type-body font-medium">{SLOTS[slot].label}</span>
                        <span className="type-caption type-numeric">{SLOTS[slot].hours}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="type-heading mb-2">La tarta</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {menu.cakes.map((c) => {
                    const from = fromPrice(c.prices);
                    return (
                      <label key={c.id} className={cn(choice, 'flex flex-col gap-1.5 p-1.5')}>
                        <input type="radio" name="cakeId" value={c.id} checked={values.cakeId === c.id} onChange={() => chooseCake(c.id)} className="sr-only" />
                        {c.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a same-origin file
                          <img src={c.photo} alt="" className="aspect-square w-full rounded-[10px] object-cover" loading="lazy" />
                        ) : (
                          <span aria-hidden className="block aspect-square w-full rounded-[10px] bg-surface-sunken" />
                        )}
                        <span className="px-1 text-[0.875rem] font-medium leading-snug text-ink">{c.name}</span>
                        {from !== null ? <span className="type-caption px-1 pb-1">desde {formatEuros(from)}</span> : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="type-heading mb-1">El tamaño</legend>
                <p className="type-caption mb-1">
                  {deliveryCents !== null ? 'Precio con la entrega incluida.' : 'Más la entrega, según el código postal.'}
                </p>
                <div className="flex flex-col gap-2">
                  {SIZE_IDS.map((size) => {
                    const cents = priceFor(cake.prices, size);
                    const note = menu.bakery.sizeNotes[size];
                    return (
                      <label
                        key={size}
                        className={cn(choice, 'flex items-baseline justify-between gap-3 px-4 py-3', cents === null && 'pointer-events-none opacity-40')}
                      >
                        <input
                          type="radio"
                          name="size"
                          value={size}
                          checked={values.size === size}
                          disabled={cents === null}
                          onChange={() => set('size', size)}
                          className="sr-only"
                        />
                        <span className="min-w-0">
                          <span className="type-body font-semibold">{SIZES[size].label}</span>
                          {note ? <span className="type-caption ml-2">{note}</span> : null}
                        </span>
                        <span className="type-body type-numeric shrink-0 font-semibold">
                          {cents === null ? 'No disponible' : formatEuros(cents + (deliveryCents ?? 0))}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {error('size') ? (
                  <p role="alert" className="type-caption text-critical">
                    {error('size')}
                  </p>
                ) : null}
              </fieldset>

              <Field label="Alergias o algo a evitar · opcional" htmlFor="allergies" error={error('allergies')}>
                <Input {...text('allergies')} maxLength={ORDER_LIMITS.notes} autoComplete="off" />
              </Field>

              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
                <span>
                  <span className="type-heading block">Total</span>
                  <span className="type-caption">1 tarta, entregada en mano. Todo incluido.</span>
                </span>
                <span className="font-display text-[1.75rem] font-semibold type-numeric">{total !== null ? formatEuros(total) : '—'}</span>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 className="type-title text-balance">Diséñala</h2>

              <section aria-labelledby="top-title" className="flex flex-col gap-4">
                <div>
                  <h3 id="top-title" className="type-heading">
                    Encima de la tarta
                  </h3>
                  <p className="type-caption mt-1 text-pretty">
                    {menu.bakery.printsPhotos
                      ? 'Un logo, una foto vuestra, un meme… y una frase corta. Se imprimen encima. Las dos son opcionales.'
                      : `En ${menu.city} todavía no imprimimos fotos: la tarta lleva tu frase escrita encima.`}
                  </p>
                </div>
                <CakePreview photo={values.photo || null} text={values.cakeText} className="mx-auto max-w-[17rem] lg:hidden" />
                {menu.bakery.printsPhotos ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className={fileButton}>
                        {photoBusy ? 'Preparando…' : values.photo ? 'Cambiar la foto' : 'Subir una foto o un logo'}
                        <input type="file" accept="image/*" className="sr-only" onChange={onPhoto} name="photo" />
                      </label>
                      {values.photo ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => set('photo', '')}>
                          Quitar
                        </Button>
                      ) : null}
                    </div>
                    {error('photo') ? (
                      <p role="alert" className="type-caption text-critical">
                        {error('photo')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex flex-col gap-2">
                  <Field
                    label="La frase de encima"
                    htmlFor="cakeText"
                    error={error('cakeText')}
                    hint={`${values.cakeText.length}/${ORDER_LIMITS.cakeText} · Corta se lee mejor.`}
                  >
                    <Input {...text('cakeText')} maxLength={ORDER_LIMITS.cakeText} autoComplete="off" />
                  </Field>
                  <div className="flex flex-wrap gap-1.5" aria-label="Ideas">
                    {CAKE_TEXT_IDEAS.map((idea) => (
                      <button
                        key={idea}
                        type="button"
                        onClick={() => set('cakeText', idea)}
                        className="pressable rounded-pill bg-surface-sunken px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-brand-soft"
                      >
                        {idea}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <fieldset className="flex flex-col gap-3 border-t border-line pt-6">
                <legend className="sr-only">La tarjeta</legend>
                <div>
                  <h3 className="type-heading">La tarjeta</h3>
                  <p className="type-caption mt-1 text-pretty">Lo que quieras decirle con más calma, impreso en una tarjeta dentro de la caja.</p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {CARD_DESIGN_IDS.map((design) => (
                    <label key={design} className={cn(choice, 'flex flex-col gap-2 p-2 sm:p-2.5')}>
                      <input
                        type="radio"
                        name="cardDesign"
                        value={design}
                        checked={values.cardDesign === design}
                        onChange={() => set('cardDesign', design)}
                        className="sr-only"
                      />
                      <CardPreview design={design} message={values.cardMessage} signOff={cardSignOff} to={values.recipientName} label={CARD_DESIGNS[design].label} />
                      <span className="px-0.5 text-[0.875rem] font-semibold leading-tight text-ink">{CARD_DESIGNS[design].label}</span>
                      <span className="-mt-1.5 px-0.5 text-[0.72rem] leading-snug text-ink-muted">{CARD_DESIGNS[design].hint}</span>
                    </label>
                  ))}
                </div>
                <div className="mx-auto w-full max-w-[15rem] lg:hidden">
                  <CardPreview
                    design={values.cardDesign}
                    message={values.cardMessage}
                    signOff={cardSignOff}
                    to={values.recipientName}
                    className="shadow-[var(--shadow-lift)]"
                    label="Vista previa de la tarjeta"
                  />
                </div>
                <Field label="Tu mensaje" htmlFor="cardMessage" error={error('cardMessage')} hint={`${values.cardMessage.length}/${ORDER_LIMITS.cardMessage}`}>
                  <Textarea
                    {...text('cardMessage')}
                    onChange={(e) => {
                      setCardTouched(true);
                      set('cardMessage', e.target.value);
                    }}
                    rows={3}
                    maxLength={ORDER_LIMITS.cardMessage}
                  />
                </Field>
                {!values.anonymous ? (
                  <Field label="Firmado · opcional" htmlFor="signOff" error={error('signOff')} hint="Si lo dejas vacío, firmamos con tu nombre.">
                    <Input {...text('signOff')} maxLength={ORDER_LIMITS.signOff} placeholder="Pablo, de Startup · pablo@startup.es" autoComplete="off" />
                  </Field>
                ) : null}
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" name="anonymous" checked={values.anonymous} onChange={(e) => set('anonymous', e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--brand)]" />
                  <span className="type-body">Sorpresa anónima: la tarjeta no dice quién la envía</span>
                </label>
              </fieldset>

              <section aria-labelledby="doc-title" className="flex flex-col gap-2 border-t border-line pt-6">
                <h3 id="doc-title" className="type-heading">
                  Un documento para la caja · opcional
                </h3>
                <p className="type-caption text-pretty">
                  Tu CV, una propuesta, un dossier… Lo imprimimos y va dentro de la caja, con la tarjeta. PDF, JPG o PNG, hasta{' '}
                  {formatBytes(ORDER_DOCUMENT.maxBytes)}.
                </p>
                {values.document ? (
                  <div className="flex items-center justify-between gap-3 rounded-field bg-surface px-4 py-3 ring-1 ring-line-strong">
                    <span className="min-w-0">
                      <span className="type-body block truncate font-medium">{values.document.name}</span>
                      <span className="type-caption">{formatBytes(values.document.size)}</span>
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => set('document', null)}>
                      Quitar
                    </Button>
                  </div>
                ) : (
                  <label className={fileButton}>
                    {docBusy ? 'Leyendo…' : 'Añadir un documento'}
                    <input type="file" accept={ORDER_DOCUMENT.accept} className="sr-only" onChange={onDocument} name="document" />
                  </label>
                )}
                {error('document') ? (
                  <p role="alert" className="type-caption text-critical">
                    {error('document')}
                  </p>
                ) : null}
              </section>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 className="type-title text-balance">Revisa y paga</h2>

              <div className="mx-auto w-full max-w-[20rem] lg:hidden">{box()}</div>

              <Summary
                cakeName={cake.name}
                size={values.size}
                price={price}
                deliveryCents={deliveryCents}
                deliveryOptions={deliveryOptions}
                total={total}
                hasPhoto={Boolean(values.photo)}
                cakeText={values.cakeText.trim()}
                cardDesign={values.cardDesign}
                documentName={values.document?.name ?? null}
                city={zone?.city ?? menu.city}
                address={values.address}
                deliverOn={values.deliverOn}
                timeSlot={values.timeSlot}
                recipient={values.recipientName}
                onEdit={(i) => goTo(i)}
              />

              <fieldset className="flex flex-col gap-4">
                <legend className="type-heading mb-2">Tus datos</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tu nombre" htmlFor="senderName" error={error('senderName')}>
                    <Input {...text('senderName')} required autoComplete="name" maxLength={ORDER_LIMITS.name} />
                  </Field>
                  <Field label="Tu teléfono" htmlFor="senderPhone" error={error('senderPhone')} hint="Por si hay que hablar de la entrega.">
                    <Input {...text('senderPhone')} required type="tel" inputMode="tel" autoComplete="tel" maxLength={ORDER_LIMITS.phone} />
                  </Field>
                  <Field label="Tu email" htmlFor="senderEmail" error={error('senderEmail')} hint="Para el recibo del pago.">
                    <Input {...text('senderEmail')} required type="email" autoComplete="email" maxLength={ORDER_LIMITS.email} />
                  </Field>
                  <Field label="Tu empresa · opcional" htmlFor="senderCompany" error={error('senderCompany')}>
                    <Input {...text('senderCompany')} autoComplete="organization" maxLength={ORDER_LIMITS.company} />
                  </Field>
                </div>
              </fieldset>

              <label className="flex cursor-pointer items-start gap-3 rounded-field bg-surface-sunken p-4 has-[:checked]:bg-brand-soft">
                <input
                  type="checkbox"
                  name="recipientConsent"
                  checked={values.recipientConsent}
                  onChange={(e) => set('recipientConsent', e.target.checked)}
                  required
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
                />
                <span className="type-caption text-pretty text-ink">
                  Los datos de quien recibe la tarta solo se usan para entregársela, y se borran después. Ver{' '}
                  <Link href="/privacidad" target="_blank" className="font-medium text-brand underline underline-offset-2">
                    privacidad
                  </Link>
                  .
                </span>
              </label>
              {error('recipientConsent') ? (
                <p role="alert" className="type-caption -mt-3 text-critical">
                  {error('recipientConsent')}
                </p>
              ) : null}
              <label className="flex cursor-pointer items-start gap-3 px-1">
                <input
                  type="checkbox"
                  name="marketingOptIn"
                  checked={values.marketingOptIn}
                  onChange={(e) => set('marketingOptIn', e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
                />
                <span className="type-caption text-pretty">Quiero recibir novedades de Tartale por email. Opcional; puedes darte de baja cuando quieras.</span>
              </label>
            </>
          ) : null}
        </div>

        {/* A field people never see; a bot that fills everything fills this too. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="website">No rellenes este campo</label>
          <input ref={honeypotRef} type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        {message ? (
          <p role="alert" className="type-caption rounded-field bg-critical-soft px-4 py-3 text-critical">
            {message}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          {step > 0 ? (
            <Button type="button" variant="secondary" onClick={() => goTo(step - 1)} disabled={sending}>
              Atrás
            </Button>
          ) : null}
          <Button type="submit" size="lg" className="flex-1" disabled={sending || busy}>
            {step === 0 ? 'Seguir: el diseño' : step === 1 ? 'Seguir: revisar' : sending ? 'Abriendo el pago…' : total !== null ? `Pagar ${formatEuros(total)}` : 'Pagar'}
          </Button>
        </div>
        {step === STEPS.length - 1 ? (
          <p className="type-caption -mt-3 text-center text-pretty">
            Pagas con tarjeta en la página segura de Stripe. Si no podemos entregarla, te devolvemos el dinero.{' '}
            <Link href="/condiciones" target="_blank" className="underline underline-offset-2">
              Condiciones
            </Link>
          </p>
        ) : null}
      </form>

      <aside className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-5" aria-label="Tu pedido">
        {box()}
        <p className="type-caption text-center text-pretty">
          Un boceto de lo que le llega: la tarta, lo impreso encima y la tarjeta{values.document ? ' con tu documento' : ''}.
        </p>
        <div className="rounded-card bg-surface p-5 ring-1 ring-line/70">
          <p className="type-body flex justify-between gap-3">
            <span>
              {cake.name} · {SIZES[values.size].label.toLowerCase()}
            </span>
            <span className="type-numeric">{price !== null ? formatEuros(price) : '—'}</span>
          </p>
          <p className="type-caption mt-1 flex justify-between gap-3">
            <span>Entrega en {zone?.city ?? menu.city}</span>
            <span className="type-numeric">{deliveryCents !== null ? formatEuros(deliveryCents) : 'según el código postal'}</span>
          </p>
          <p className="type-body mt-3 flex justify-between gap-3 border-t border-line pt-3 font-semibold">
            <span>Total</span>
            <span className="type-numeric">{total !== null ? formatEuros(total) : '—'}</span>
          </p>
        </div>
      </aside>
    </div>
  );
}

/** The three steps, like a receipt's header: done ones take you back, the next ones wait. */
function Stepper({ step, onBack, disabled }: { step: number; onBack: (step: number) => void; disabled: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Pasos">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        const inner = (
          <>
            <span
              aria-hidden
              className={cn(
                'grid h-6 w-6 place-items-center rounded-full text-[0.75rem] font-bold type-numeric',
                current ? 'bg-brand text-white' : done ? 'bg-chocolate text-ink-inverse' : 'text-ink-subtle ring-1 ring-line-strong',
              )}
            >
              {done ? '✓' : i + 1}
            </span>
            {/* On a phone only the current step is named; the others keep their name for screen readers. */}
            <span
              className={cn(
                'text-[0.875rem]',
                current ? 'font-semibold text-ink' : done ? 'sr-only font-medium text-ink sm:not-sr-only' : 'sr-only text-ink-subtle sm:not-sr-only',
              )}
            >
              {label}
            </span>
          </>
        );
        return (
          <li key={label} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
            {i > 0 ? <span aria-hidden className="h-px w-4 bg-line-strong sm:w-8" /> : null}
            {done ? (
              <button
                type="button"
                onClick={() => onBack(i)}
                disabled={disabled}
                className="pressable flex items-center gap-2 rounded-pill py-1 pr-2 hover:underline hover:underline-offset-4"
              >
                {inner}
              </button>
            ) : (
              <span className={cn('flex items-center gap-2 py-1', current && 'rounded-pill bg-surface pl-1 pr-3 ring-1 ring-line')}>{inner}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Summary({
  cakeName,
  size,
  price,
  deliveryCents,
  deliveryOptions,
  total,
  hasPhoto,
  cakeText,
  cardDesign,
  documentName,
  city,
  address,
  deliverOn,
  timeSlot,
  recipient,
  onEdit,
}: {
  cakeName: string;
  size: CakeSize;
  price: number | null;
  deliveryCents: number | null;
  deliveryOptions: number[];
  total: number | null;
  hasPhoto: boolean;
  cakeText: string;
  cardDesign: CardDesign;
  documentName: string | null;
  city: string;
  address: string;
  deliverOn: string;
  timeSlot: TimeSlot;
  recipient: string;
  onEdit: (step: number) => void;
}) {
  const edit = (to: number) => (
    <button type="button" onClick={() => onEdit(to)} className="type-caption shrink-0 font-medium text-brand underline underline-offset-2">
      Cambiar
    </button>
  );
  const top = hasPhoto ? (cakeText ? `tu foto y «${cakeText}»` : 'tu foto') : cakeText ? `«${cakeText}»` : 'nada';
  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-5 ring-1 ring-line/70">
      <div className="flex items-start justify-between gap-3">
        <p className="type-body text-pretty">
          <strong>Para {recipient || '…'}</strong>
          <span className="type-caption block">
            {address ? `${address}, ${city}` : city} · {deliverOn ? longDate(deliverOn) : ''}, {SLOTS[timeSlot].label.toLowerCase()} ({SLOTS[timeSlot].hours})
          </span>
        </p>
        {edit(0)}
      </div>
      <div className="flex items-start justify-between gap-3 border-t border-line pt-3">
        <p className="type-body text-pretty">
          Tarta {cakeName} · {SIZES[size].label.toLowerCase()}
          <span className="type-caption block">
            Encima: {top}. En la caja: tarjeta {CARD_DESIGNS[cardDesign].label.toLowerCase()}
            {documentName ? ` y tu documento (${documentName})` : ''}.
          </span>
        </p>
        {edit(1)}
      </div>
      <div className="flex flex-col gap-1 border-t border-line pt-3">
        <p className="type-body flex justify-between gap-3">
          <span>Tarta</span>
          <span className="type-numeric">{price !== null ? formatEuros(price) : '—'}</span>
        </p>
        <p className="type-body flex justify-between gap-3">
          <span>Entrega en {city}</span>
          <span className="type-numeric">
            {deliveryCents !== null ? formatEuros(deliveryCents) : deliveryOptions.map(formatEuros).join(' o ')}
          </span>
        </p>
        <p className="type-body mt-1 flex justify-between gap-3 font-semibold">
          <span>Total</span>
          <span className="type-numeric">{total !== null ? formatEuros(total) : '—'}</span>
        </p>
      </div>
    </div>
  );
}
