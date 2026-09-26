import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { headers } from 'next/headers';

import { BRAND } from '@/lib/brand';
import { env } from '@/lib/env';

import './globals.css';

/**
 * Two faces, shipped with the app (SIL Open Font License, see ./fonts) so a
 * build never depends on a font service and the page makes no third-party
 * request: Fraunces for headlines, DM Sans for reading.
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
    'Envía una tarta con tu foto y tu mensaje a la oficina de un cliente, un inversor, un reclutador o alguien de tu equipo. En Alicante.',
  applicationName: BRAND.name,
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: BRAND.name,
    title: BRAND.tagline,
    description: 'Una tarta con tu foto y tu mensaje, entregada en su oficina.',
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
  await headers();

  return (
    <html lang="es" className={`${sans.variable} ${display.variable}`}>
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
