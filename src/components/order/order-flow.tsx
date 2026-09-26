'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { CakePreview } from '@/components/cake/cake-preview';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { cn } from '@/lib/cn';
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

type Values = {
  cakeId: number;
  size: CakeSize;
  photo: string;
  cakeText: string;
  allergies: string;
  occasion: Occasion;
  recipientName: string;
  recipientCompany: string;
  addressKind: AddressKind;
  address: string;
  postalCode: string;
  deliveryNotes: string;
  deliverOn: string;
  timeSlot: TimeSlot;
  cardMessage: string;
  signOff: string;
  anonymous: boolean;
  recipientPhone: string;
  senderName: string;
  senderPhone: string;
  senderEmail: string;
  senderCompany: string;
  recipientConsent: boolean;
  marketingOptIn: boolean;
};

const STEPS = ['La tarta', 'Para quién', 'Tus datos'] as const;

/** Which step a field lives on, to jump back to it when the server objects. */
const FIELD_STEP: Record<string, number> = {
  cakeId: 0, size: 0, photo: 0, cakeText: 0, allergies: 0,
  occasion: 1, recipientName: 1, recipientCompany: 1, addressKind: 1, address: 1, postalCode: 1,
  deliveryNotes: 1, deliverOn: 1, timeSlot: 1, cardMessage: 1, signOff: 1, anonymous: 1, recipientPhone: 1,
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

const choice =
  'pressable cursor-pointer rounded-field ring-1 ring-line-strong bg-surface transition-colors ' +
  'has-[:checked]:bg-brand-soft has-[:checked]:ring-2 has-[:checked]:ring-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand';

export function OrderFlow({
  menu,
  earliest,
  latest,
  closedWeekdays,
}: {
  menu: PublicMenu;
  earliest: string;
  latest: string;
  closedWeekdays: number[];
}) {
  const firstCake = menu.cakes.find((c) => priceFor(c.prices, 'mediana') !== null) ?? menu.cakes[0]!;
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({
    cakeId: firstCake.id,
    size: priceFor(firstCake.prices, 'mediana') !== null ? 'mediana' : SIZE_IDS.find((s) => priceFor(firstCake.prices, s) !== null)!,
    photo: '',
    cakeText: '',
    allergies: '',
    occasion: 'networking',
    recipientName: '',
    recipientCompany: '',
    addressKind: 'oficina',
    address: '',
    postalCode: '',
    deliveryNotes: '',
    deliverOn: earliest,
    timeSlot: 'manana',
    cardMessage: OCCASIONS.networking.card,
    signOff: '',
    anonymous: false,
    recipientPhone: '',
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
  const startedAt = useRef(Date.now());
  const stepRef = useRef<HTMLDivElement>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const cake = menu.cakes.find((c) => c.id === values.cakeId) ?? firstCake;
  const price = priceFor(cake.prices, values.size);
  const allCodes = useMemo(() => [...new Set(menu.zones.flatMap((z) => z.postalCodes))], [menu.zones]);
  const zone = menu.zones.find((z) => z.postalCodes.includes(values.postalCode.trim())) ?? null;
  const deliveryCents = zone?.deliveryCents ?? (menu.zones.length === 1 ? menu.zones[0]!.deliveryCents : null);
  const total = price !== null && deliveryCents !== null ? price + deliveryCents : null;
  const deliveryOptions = [...new Set(menu.zones.map((z) => z.deliveryCents))];

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

  /** The checks the browser cannot do by itself, per step. */
  function customErrors(forStep: number): Record<string, string> {
    const found: Record<string, string> = {};
    if (forStep === 0 && price === null) found.size = 'Esta tarta no se hace en ese tamaño.';
    if (forStep === 1) {
      const code = values.postalCode.trim();
      if (/^\d{5}$/.test(code) && !zone) {
        found.postalCode = `Todavía no llegamos ahí. Entregamos en ${formatPostcodes(allCodes)}.`;
      }
      if (values.deliverOn && closedWeekdays.includes(weekday(values.deliverOn))) {
        const days = WEEKDAYS.find((w) => w.id === weekday(values.deliverOn))?.plural ?? 'ese día';
        found.deliverOn = `Los ${days} no repartimos. Elige otro día.`;
      } else if (values.deliverOn && (values.deliverOn < earliest || values.deliverOn > latest)) {
        found.deliverOn = values.deliverOn < earliest ? `Lo antes posible: ${longDate(earliest)}.` : 'Ese día está demasiado lejos.';
      }
    }
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
  const preview = <CakePreview photo={values.photo || null} text={values.cakeText} className={step === 0 ? 'max-w-[20rem]' : 'max-w-[11rem]'} />;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <form onSubmit={onSubmit} noValidate={false} className="flex min-w-0 flex-col gap-6" aria-label="Pedido">
        <ol className="flex items-center gap-2" aria-label="Pasos">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 flex-col gap-1.5">
              <span className={cn('h-1.5 rounded-pill transition-colors', i <= step ? 'bg-brand' : 'bg-line')} />
              <span className={cn('type-caption', i === step ? 'font-semibold text-ink' : '')} aria-current={i === step ? 'step' : undefined}>
                {i + 1}. {label}
              </span>
            </li>
          ))}
        </ol>

        <div className="lg:hidden">{preview}</div>

        <div ref={stepRef} key={step} className="step-enter flex flex-col gap-6">
          {step === 0 ? (
            <>
              {menu.bakery.printsPhotos ? (
                <div className="flex flex-col gap-2">
                  <p className="type-heading">Tu foto en la tarta</p>
                  <p className="type-caption text-pretty">Un logo, una foto vuestra, un meme… Se imprime encima. Opcional.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="pressable inline-flex h-11 cursor-pointer items-center rounded-pill bg-surface px-5 text-[0.9375rem] font-semibold text-ink ring-1 ring-line-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
                      {photoBusy ? 'Preparando…' : values.photo ? 'Cambiar la foto' : 'Subir una foto'}
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
              ) : (
                <p className="type-caption rounded-field bg-surface-sunken px-4 py-3">
                  En {menu.city} todavía no imprimimos fotos: la tarta lleva tu frase escrita encima.
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Field
                  label="La frase de encima"
                  htmlFor="cakeText"
                  error={error('cakeText')}
                  hint={`${values.cakeText.length}/${ORDER_LIMITS.cakeText} · Corta se lee mejor.`}
                >
                  <Input {...text('cakeText')} maxLength={ORDER_LIMITS.cakeText} placeholder="¿Un café esta semana? ☕" autoComplete="off" />
                </Field>
                <p className="type-caption">Ideas (toca una):</p>
                <div className="flex flex-wrap gap-1.5">
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

              <fieldset className="flex flex-col gap-2">
                <legend className="type-heading mb-2">El sabor</legend>
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
                          <span aria-hidden className="grid aspect-square w-full place-items-center rounded-[10px] bg-surface-sunken text-2xl">
                            🎂
                          </span>
                        )}
                        <span className="px-1 text-[0.875rem] font-medium leading-snug text-ink">{c.name}</span>
                        {from !== null ? <span className="type-caption px-1 pb-1">desde {formatEuros(from)}</span> : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="type-heading mb-2">El tamaño</legend>
                <div className="grid grid-cols-3 gap-2">
                  {SIZE_IDS.map((size) => {
                    const cents = priceFor(cake.prices, size);
                    const note = menu.bakery.sizeNotes[size];
                    return (
                      <label key={size} className={cn(choice, 'flex flex-col items-center gap-0.5 px-1 py-3 text-center', cents === null && 'pointer-events-none opacity-40')}>
                        <input
                          type="radio"
                          name="size"
                          value={size}
                          checked={values.size === size}
                          disabled={cents === null}
                          onChange={() => set('size', size)}
                          className="sr-only"
                        />
                        <span className="type-body font-semibold">{SIZES[size].label}</span>
                        <span className="type-caption type-numeric">{cents === null ? 'No disponible' : formatEuros(cents)}</span>
                        {note ? <span className="text-[0.72rem] leading-tight text-ink-subtle">{note}</span> : null}
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
            </>
          ) : null}

          {step === 1 ? (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="type-heading mb-2">¿Para qué es?</legend>
                <div className="flex flex-wrap gap-2">
                  {OCCASION_IDS.map((id) => (
                    <label
                      key={id}
                      className="pressable cursor-pointer rounded-pill bg-surface px-3.5 py-2 ring-1 ring-line-strong has-[:checked]:bg-chocolate has-[:checked]:text-ink-inverse has-[:checked]:ring-chocolate has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
                    >
                      <input type="radio" name="occasion" value={id} checked={values.occasion === id} onChange={() => chooseOccasion(id)} className="sr-only" />
                      <span className="text-[0.875rem] font-medium">
                        {OCCASIONS[id].emoji} {OCCASIONS[id].label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Su nombre" htmlFor="recipientName" error={error('recipientName')}>
                  <Input {...text('recipientName')} required maxLength={ORDER_LIMITS.name} autoComplete="off" />
                </Field>
                <Field label="Su empresa · opcional" htmlFor="recipientCompany" error={error('recipientCompany')}>
                  <Input {...text('recipientCompany')} maxLength={ORDER_LIMITS.company} autoComplete="off" />
                </Field>
              </div>

              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="sr-only">¿Dónde?</legend>
                {(['oficina', 'casa'] as const).map((kind) => (
                  <label key={kind} className={cn(choice, 'flex items-center justify-center gap-2 py-3')}>
                    <input type="radio" name="addressKind" value={kind} checked={values.addressKind === kind} onChange={() => set('addressKind', kind)} className="sr-only" />
                    <span className="type-body font-medium">{kind === 'oficina' ? '🏢 A su oficina' : '🏠 A su casa'}</span>
                  </label>
                ))}
              </fieldset>

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
              {!error('postalCode') && allCodes.length > 0 ? (
                <p className="type-caption -mt-3">
                  {menu.city}: {formatPostcodes(allCodes)}.
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="¿Qué día?"
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
                <fieldset className="flex flex-col gap-2">
                  <legend className="sr-only">Franja</legend>
                  {SLOT_IDS.map((slot) => (
                    <label key={slot} className={cn(choice, 'flex items-center justify-between gap-2 px-3.5 py-2.5')}>
                      <input type="radio" name="timeSlot" value={slot} checked={values.timeSlot === slot} onChange={() => set('timeSlot', slot)} className="sr-only" />
                      <span className="type-body font-medium">{SLOTS[slot].label}</span>
                      <span className="type-caption type-numeric">{SLOTS[slot].hours}</span>
                    </label>
                  ))}
                </fieldset>
              </div>

              <div className="flex flex-col gap-4 rounded-card bg-[#fffaf1] p-4 ring-1 ring-line sm:p-5">
                <p className="type-heading">La tarjeta que va con la tarta</p>
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
              </div>

              <Field
                label="Su teléfono · opcional"
                htmlFor="recipientPhone"
                error={error('recipientPhone')}
                hint="Solo para la entrega, por si hace falta avisar en la puerta. Nunca le escribimos por otra cosa."
              >
                <Input {...text('recipientPhone')} type="tel" inputMode="tel" autoComplete="off" />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
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

              <Summary
                cakeName={cake.name}
                size={values.size}
                price={price}
                deliveryCents={deliveryCents}
                deliveryOptions={deliveryOptions}
                total={total}
                withPhoto={Boolean(values.photo)}
                city={menu.city}
                deliverOn={values.deliverOn}
                timeSlot={values.timeSlot}
                recipient={values.recipientName}
              />

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
          <Button type="submit" size="lg" className="flex-1" disabled={sending || photoBusy}>
            {step < STEPS.length - 1
              ? 'Seguir'
              : sending
                ? 'Abriendo el pago…'
                : total !== null
                  ? `Pagar ${formatEuros(total)}`
                  : 'Pagar'}
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

      <aside className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-4">
        <CakePreview photo={values.photo || null} text={values.cakeText} />
        <p className="type-caption text-center">Vista previa orientativa</p>
        {step >= 1 ? (
          <div className="rounded-card bg-[#fffaf1] p-5 ring-1 ring-line">
            <p className="type-eyebrow text-ink-subtle">La tarjeta</p>
            <p className="mt-3 whitespace-pre-line font-display text-[1.1rem] leading-snug text-pretty">{values.cardMessage || '…'}</p>
            <p className="type-caption mt-3 text-right">
              {values.anonymous ? '(anónima)' : `— ${values.signOff || values.senderName || 'tu nombre'}`}
            </p>
          </div>
        ) : null}
        <div className="rounded-card bg-surface p-5 ring-1 ring-line/70">
          <p className="type-body flex justify-between gap-3">
            <span>
              {cake.name} · {SIZES[values.size].label.toLowerCase()}
            </span>
            <span className="type-numeric">{price !== null ? formatEuros(price) : '—'}</span>
          </p>
          <p className="type-caption mt-1 flex justify-between gap-3">
            <span>Entrega en {menu.city}</span>
            <span className="type-numeric">{deliveryCents !== null ? formatEuros(deliveryCents) : 'según el código postal'}</span>
          </p>
        </div>
      </aside>
    </div>
  );
}

function Summary({
  cakeName,
  size,
  price,
  deliveryCents,
  deliveryOptions,
  total,
  withPhoto,
  city,
  deliverOn,
  timeSlot,
  recipient,
}: {
  cakeName: string;
  size: CakeSize;
  price: number | null;
  deliveryCents: number | null;
  deliveryOptions: number[];
  total: number | null;
  withPhoto: boolean;
  city: string;
  deliverOn: string;
  timeSlot: TimeSlot;
  recipient: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card bg-surface p-5 ring-1 ring-line/70">
      <p className="type-heading">Resumen</p>
      <p className="type-caption">
        Para {recipient || '…'} · {deliverOn ? longDate(deliverOn) : ''}, {SLOTS[timeSlot].label.toLowerCase()} ({SLOTS[timeSlot].hours})
      </p>
      <p className="type-body mt-1 flex justify-between gap-3">
        <span>
          Tarta {cakeName} · {SIZES[size].label.toLowerCase()}
          {withPhoto ? ' · con foto' : ''}
        </span>
        <span className="type-numeric">{price !== null ? formatEuros(price) : '—'}</span>
      </p>
      <p className="type-body flex justify-between gap-3">
        <span>Entrega en {city}</span>
        <span className="type-numeric">
          {deliveryCents !== null ? formatEuros(deliveryCents) : deliveryOptions.map(formatEuros).join(' o ')}
        </span>
      </p>
      <p className="type-body flex justify-between gap-3 border-t border-line pt-2 font-semibold">
        <span>Total</span>
        <span className="type-numeric">{total !== null ? formatEuros(total) : '—'}</span>
      </p>
    </div>
  );
}
