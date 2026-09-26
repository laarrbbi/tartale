import type { Metadata } from 'next';

import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { CakePreview } from '@/components/cake/cake-preview';

export const metadata: Metadata = { title: 'Enviar una tarta' };

/** Placeholder until the order flow ships (step 2). */
export default function SendPage() {
  return (
    <>
      <SiteHeader cta={false} />
      <main id="main" className="mx-auto flex max-w-md flex-col items-center gap-6 px-5 py-16 text-center">
        <CakePreview photo={null} text="Muy pronto" className="max-w-[16rem]" />
        <h1 className="type-display">Estamos terminando el horno</h1>
        <p className="type-lead text-pretty">Muy pronto podrás diseñar y enviar tu tarta desde aquí.</p>
      </main>
      <SiteFooter />
    </>
  );
}
