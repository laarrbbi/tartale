import Link from 'next/link';

import { BRAND, LEGAL } from '@/lib/brand';

import { Logo } from './logo';

export function SiteFooter() {
  return (
    <footer className="bg-chocolate text-ink-inverse">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-[1.4fr_1fr]">
        <div>
          <Logo inverse />
          <p className="mt-3 max-w-sm text-[0.9375rem] text-pretty text-[#e8d8c6]">
            {BRAND.tagline} Tartas con tu foto y tu mensaje, entregadas en su oficina.
          </p>
        </div>
        <nav aria-label="Enlaces" className="grid grid-cols-2 gap-2 text-[0.9375rem] text-[#e8d8c6]">
          <Link href="/enviar" className="hover:text-white">Enviar una tarta</Link>
          <Link href="/#preguntas" className="hover:text-white">Preguntas</Link>
          <Link href="/condiciones" className="hover:text-white">Condiciones</Link>
          <Link href="/privacidad" className="hover:text-white">Privacidad</Link>
          <Link href="/aviso-legal" className="hover:text-white">Aviso legal</Link>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-5 py-5 text-[0.8125rem] text-[#cdb8a2]">
          © {new Date().getFullYear()} {LEGAL.name ?? BRAND.name}
        </p>
      </div>
    </footer>
  );
}
