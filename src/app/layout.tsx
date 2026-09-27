import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { headers } from 'next/headers';

import { BRAND } from '@/lib/brand';
import { env } from '@/lib/env';

import './globals.css';

/**
 * The faces, shipped with the app (SIL Open Font License, see ./fonts) so a
 * build never depends on a font service and the page makes no third-party
 * request: Fraunces for headlines, DM Sans for reading, and Caveat for the
 * handwritten card design.
 */
const sans = localFont({
  src: './fonts/dm-sans-latin-wght.woff2',
  weight: '100 1000',
  variable: '--font-dm-sans',
  display: 'swap',
});

const display = localFont({
  src: [
    { path: './fonts/fraunces-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: './fonts/fraunces-latin-wght-italic.woff2', weight: '100 900', style: 'italic' },
  ],
  variable: '--font-fraunces',
  display: 'swap',
});

/** Only the "A mano" card uses it: declared everywhere, fetched only where it is drawn. */
const hand = localFont({
  src: './fonts/caveat-latin-wght.woff2',
  weight: '400 700',
  variable: '--font-caveat',
  display: 'swap',
  preload: false,
});

/**
 * Every page carries a per-request CSP nonce (src/proxy.ts), which only a page
 * rendered per request can use: a prerendered page's scripts would have no
 * nonce and the browser would refuse them. So nothing is prerendered.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_ORIGIN),
  title: {
    default: `${BRAND.name} · ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    'Envía una tarta con tu foto o tu logo impresos encima y una tarjeta escrita por ti —y, si quieres, tu CV o tu propuesta en la caja— a la oficina de un cliente, un inversor, un reclutador o alguien de tu equipo. En Alicante.',
  applicationName: BRAND.name,
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: BRAND.name,
    title: BRAND.tagline,
    description: 'Una tarta con tu foto impresa y tu tarjeta, entregada en su oficina.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom stays enabled: disabling it is an accessibility failure.
  maximumScale: 5,
  themeColor: '#fbf6ef',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Belt and braces with `dynamic` above: reading the request makes the route
  // dynamic even if the segment config is ever removed.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    // The inline script below adds "js" before the first paint, so what the
    // page will animate in can start hidden (and is never hidden without it).
    <html lang="es" className={`${sans.variable} ${display.variable} ${hand.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-surface focus:px-4 focus:py-2 focus:shadow-[var(--shadow-card)]"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
