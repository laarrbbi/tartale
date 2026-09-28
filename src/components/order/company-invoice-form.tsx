'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { INVOICE_LIMITS } from '@/lib/invoices';
import { isValidTaxId } from '@/lib/tax-id';

/**
 * "La necesito a nombre de mi empresa": the fiscal details for a factura
 * completa. The server checks everything again; here the NIF is checked as
 * it is typed, so a wrong letter is caught before sending.
 */
export function CompanyInvoiceForm({ token, prompt }: { token: string; prompt: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const openedAt = useRef(0);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    if (!isValidTaxId(data.taxId ?? '')) {
      setErrors({ taxId: 'Ese NIF no es válido: revisa la letra o el último número' });
      return;
    }
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const response = await fetch(`/api/pedidos/${token}/factura`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...data, elapsedMs: Date.now() - openedAt.current }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string; fields?: Record<string, string>; number?: string | null } | null;
      if (!response.ok) {
        setErrors(body?.fields ?? {});
        setMessage({ ok: false, text: body?.message ?? 'No hemos podido pedirla. Inténtalo otra vez.' });
      } else {
        setOpen(false);
        setMessage({
          ok: true,
          text: body?.number ? `Hecho: tu factura ${body.number} ya está aquí.` : 'Guardado: tu factura saldrá a ese nombre y la verás aquí.',
        });
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: 'Sin conexión. Comprueba tu cobertura e inténtalo otra vez.' });
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            openedAt.current = Date.now();
            setOpen(true);
            setMessage(null);
          }}
          className="pressable type-body w-fit font-semibold text-brand underline decoration-brand/40 underline-offset-4"
        >
          {prompt}
        </button>
        {message ? (
          <p role="status" className={message.ok ? 'type-caption text-positive' : 'type-caption text-critical'}>
            {message.text}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label="Razón social, o tu nombre completo" htmlFor="inv-name" error={errors.name}>
        <Input id="inv-name" name="name" required minLength={2} maxLength={INVOICE_LIMITS.name} autoComplete="organization" />
      </Field>
      <Field label="NIF" htmlFor="inv-taxId" error={errors.taxId} hint="De la empresa, o tu DNI o NIE si eres autónomo.">
        <Input id="inv-taxId" name="taxId" required maxLength={30} autoCapitalize="characters" spellCheck={false} />
      </Field>
      <Field label="Dirección fiscal" htmlFor="inv-address" error={errors.address}>
        <Input id="inv-address" name="address" required minLength={5} maxLength={INVOICE_LIMITS.address} autoComplete="street-address" />
      </Field>
      <div className="grid grid-cols-[7.5rem_1fr] gap-3">
        <Field label="C. postal" htmlFor="inv-postalCode" error={errors.postalCode}>
          <Input id="inv-postalCode" name="postalCode" required inputMode="numeric" pattern="\d{5}" maxLength={5} autoComplete="postal-code" />
        </Field>
        <Field label="Población" htmlFor="inv-city" error={errors.city}>
          <Input id="inv-city" name="city" required minLength={2} maxLength={INVOICE_LIMITS.city} autoComplete="address-level2" />
        </Field>
      </div>
      {/* A field people never see; a bot that fills everything fills this too. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="inv-website">No rellenes este campo</label>
        <input type="text" id="inv-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {message && !message.ok ? (
        <p role="alert" className="type-caption rounded-field bg-critical-soft px-3.5 py-2.5 text-critical">
          {message.text}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Enviando…' : 'Pedir la factura'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Ahora no
        </Button>
      </div>
    </form>
  );
}
