import type { ReactNode } from 'react';

import { PENDING } from '@/lib/brand';
import { businessDetails, oneLineAddress } from '@/server/services/invoice-service';

import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

type LegalField = 'name' | 'nif' | 'address' | 'email' | 'registry';

async function legalValues(): Promise<Record<LegalField, string | null>> {
  const b = await businessDetails();
  return { name: b.legalName, nif: b.taxId, address: oneLineAddress(b), email: b.email, registry: b.registry };
}

/** A detail of the company, from Ajustes, or a visible "[pendiente]" until it is filled in. */
export async function Legal({ field }: { field: LegalField }) {
  const value = (await legalValues())[field];
  return value ? <>{value}</> : <span className="rounded bg-caution-soft px-1 text-caution">{PENDING}</span>;
}

export async function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const values = await legalValues();
  const complete = Boolean(values.name && values.nif && values.address && values.email);
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-2xl px-5 py-12 md:py-16">
        <h1 className="type-display">{title}</h1>
        <p className="type-caption mt-2">Última actualización: {updated}</p>
        {!complete ? (
          <p className="type-caption mt-6 rounded-field bg-caution-soft px-4 py-3 text-caution">
            Faltan por completar los datos de la empresa marcados como {PENDING}.
          </p>
        ) : null}
        <div className="legal mt-8 flex flex-col gap-4 text-[0.9875rem] leading-relaxed text-ink [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-[1.35rem] [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
