'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { canonicalPlace, normalizePlace } from '@/lib/cities';
import { cn } from '@/lib/cn';
import { formatEuros } from '@/lib/orders';
import { formatPostcodes } from '@/lib/zones';

export interface CheckZone {
  city: string;
  postalCodes: string[];
  deliveryCents: number;
}

type Result = { ok: boolean; text: string; postcode?: string } | null;

/**
 * "¿Llegáis a…?": a postcode or a city, answered in the browser from the
 * zones the page already shows. Nothing is sent anywhere.
 */
export function PlaceCheck({ zones, className }: { zones: CheckZone[]; className?: string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result>(null);

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (/^\d{5}$/.test(value)) {
      const zone = zones.find((z) => z.postalCodes.includes(value));
      setResult(
        zone
          ? { ok: true, text: `Sí, llegamos al ${value} (${zone.city}). La entrega cuesta ${formatEuros(zone.deliveryCents)}.`, postcode: value }
          : { ok: false, text: `Todavía no llegamos al ${value}.` },
      );
      return;
    }
    const wanted = canonicalPlace(value);
    if (normalizePlace(value).length < 2) {
      setResult({ ok: false, text: 'Escribe un código postal de 5 cifras o el nombre de una ciudad.' });
      return;
    }
    const inCity = zones.filter((z) => canonicalPlace(z.city).startsWith(wanted));
    setResult(
      inCity.length
        ? { ok: true, text: `Sí, entregamos en ${inCity[0]!.city}: ${formatPostcodes(inCity.flatMap((z) => z.postalCodes))}.` }
        : { ok: false, text: `Todavía no entregamos en ${value}.` },
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <form role="search" onSubmit={check} className="flex items-stretch rounded-field bg-surface shadow-[var(--shadow-lift)] ring-1 ring-ink/80">
        <label htmlFor="place" className="sr-only">
          Código postal o ciudad
        </label>
        <input
          id="place"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setResult(null);
          }}
          placeholder="Código postal o ciudad"
          autoComplete="off"
          maxLength={60}
          className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[1rem] text-ink outline-none placeholder:text-ink-subtle"
        />
        <button
          type="submit"
          className="pressable border-l border-line px-4 text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-ink hover:bg-surface-sunken"
        >
          Comprobar
        </button>
      </form>
      {result ? (
        <p
          role="status"
          className={cn(
            'type-caption rounded-field px-4 py-3 text-pretty shadow-[var(--shadow-card)]',
            result.ok ? 'bg-positive-soft text-ink' : 'bg-surface text-ink',
          )}
        >
          {result.text}{' '}
          {result.ok ? (
            <Link
              href={result.postcode ? `/enviar?cp=${result.postcode}` : '/enviar'}
              className="font-semibold text-brand underline underline-offset-2"
            >
              Enviar una tarta allí
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
