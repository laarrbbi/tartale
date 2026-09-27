import type { Metadata } from 'next';

import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ButtonLink } from '@/components/ui/button';
import { PlaceCheck, type CheckZone } from '@/components/zones/place-check';
import { cityCoordinates } from '@/lib/cities';
import { formatEuros } from '@/lib/orders';
import { CANARIES_BOX, CANARIES_PATH, MAP, NEIGHBOURS_PATH, SPAIN_PATH, mapPoint } from '@/lib/spain-map';
import { whatsappLink } from '@/lib/whatsapp';
import { formatPostcodes } from '@/lib/zones';
import { getSettings } from '@/server/repositories/settings';
import { publicMenus } from '@/server/services/catalog-service';

export const metadata: Metadata = {
  title: 'Dónde entregamos',
  description: 'Las ciudades y los códigos postales donde entregamos tartas. Busca el tuyo.',
};

/**
 * Where we deliver: every city with an active bakery and its postcodes, from
 * the database, on a map of Spain and in a list, with a check for a postcode
 * or a city. Nothing here is typed by hand.
 */
export default async function ZonesPage() {
  const [menus, settings] = await Promise.all([publicMenus(), getSettings()]);
  const cities = menus.map((menu) => {
    const codes = menu.zones.flatMap((z) => z.postalCodes);
    const prices = [...new Set(menu.zones.map((z) => z.deliveryCents))].sort((a, b) => a - b);
    const coordinates = cityCoordinates(menu.city);
    return {
      city: menu.city,
      bakery: menu.bakery.name,
      codes,
      prices,
      point: coordinates ? mapPoint(coordinates[0], coordinates[1]) : null,
    };
  });
  const zones: CheckZone[] = menus.flatMap((m) => m.zones.map((z) => ({ city: z.city, postalCodes: z.postalCodes, deliveryCents: z.deliveryCents })));
  const contact = whatsappLink(settings.whatsappNumber, 'Hola, ¿llegáis a mi ciudad?');

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-6xl px-5 pb-24 pt-10 md:pt-16">
        <header className="max-w-2xl">
          <h1 className="type-display text-balance">Dónde entregamos.</h1>
          <p className="type-lead mt-4 text-pretty">
            Busca tu código postal o tu ciudad. Cada tarta la hace una pastelería de la misma ciudad y se entrega en mano, el día
            que elijas.
          </p>
          <ButtonLink href="/enviar" size="lg" className="mt-7">
            Enviar una tarta
          </ButtonLink>
        </header>

        <section
          aria-label="Mapa y ciudades"
          className="mt-12 grid gap-4 rounded-[28px] bg-surface p-3 shadow-[var(--shadow-lift)] ring-1 ring-ink/80 sm:p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
        >
          <div className="relative overflow-hidden rounded-[20px] bg-[#e4ecee]">
            <PlaceCheck zones={zones} className="relative z-10 p-3 sm:absolute sm:left-4 sm:top-4 sm:w-[22rem] sm:p-0" />
            <svg viewBox={`0 0 ${MAP.width} ${MAP.height}`} role="img" aria-label="Mapa de España con las ciudades donde entregamos" className="block h-auto w-full">
              <path d={NEIGHBOURS_PATH} fill="#f1ede6" stroke="#d6cdbf" strokeWidth="1.2" strokeLinejoin="round" />
              <path d={SPAIN_PATH} fill="#fffaf1" stroke="#b9a690" strokeWidth="1.4" strokeLinejoin="round" />
              <rect
                x={CANARIES_BOX.x}
                y={CANARIES_BOX.y}
                width={CANARIES_BOX.width}
                height={CANARIES_BOX.height}
                rx="10"
                fill="#e4ecee"
                stroke="#b9a690"
                strokeWidth="1.4"
              />
              <path d={CANARIES_PATH} fill="#fffaf1" stroke="#b9a690" strokeWidth="1.2" strokeLinejoin="round" />
              {cities.map((c) =>
                c.point ? (
                  <g key={c.city} transform={`translate(${c.point.x.toFixed(1)} ${c.point.y.toFixed(1)})`}>
                    <circle r="26" fill="#b02e55" opacity="0.14" className="map-ping" />
                    {/* A pin, its tip on the city. */}
                    <path d="M0 0c-9-13-17-21-17-32a17 17 0 0 1 34 0c0 11-8 19-17 32z" fill="#b02e55" stroke="#2b1810" strokeWidth="2.5" />
                    <circle cy="-32" r="6" fill="#fffaf1" />
                    <text x="24" y="-26" className="fill-ink font-display text-[30px] font-semibold">
                      {c.city}
                    </text>
                  </g>
                ) : null,
              )}
            </svg>
          </div>

          <div className="flex flex-col rounded-[20px] p-4 ring-1 ring-line sm:p-6">
            <h2 className="type-title">Ciudades</h2>
            <p className="type-caption mt-1">
              {cities.length === 0
                ? 'Ahora mismo no estamos entregando.'
                : cities.length === 1
                  ? 'Por ahora, una. Vamos ciudad a ciudad, con una pastelería de cada una.'
                  : `Por ahora, ${cities.length}. Vamos ciudad a ciudad, con una pastelería de cada una.`}
            </p>
            <ul className="mt-5 flex flex-col gap-3">
              {cities.map((c) => (
                <li key={c.city} className="rounded-field bg-surface-sunken/60 p-4 ring-1 ring-line">
                  <p className="flex items-center gap-2">
                    <svg aria-hidden viewBox="0 0 34 50" className="h-5 w-auto shrink-0">
                      <path d="M17 48C8 35 1 27 1 17a16 16 0 0 1 32 0c0 10-7 18-16 31z" fill="#b02e55" stroke="#2b1810" strokeWidth="2" />
                      <circle cx="17" cy="17" r="5.5" fill="#fffaf1" />
                    </svg>
                    <span className="type-heading">{c.city}</span>
                  </p>
                  <p className="type-caption mt-2 text-pretty">Códigos postales: {formatPostcodes(c.codes)}</p>
                  <p className="type-caption mt-1">
                    Entrega: {c.prices.map(formatEuros).join(' o ')} · la hace {c.bakery}
                  </p>
                </li>
              ))}
            </ul>
            <p className="type-caption mt-auto pt-6 text-pretty">
              ¿No está tu ciudad?{' '}
              {contact ? (
                <a href={contact} className="font-medium text-brand underline underline-offset-2">
                  Escríbenos
                </a>
              ) : (
                'Escríbenos'
              )}
              : nos ayuda a decidir dónde ir después.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
