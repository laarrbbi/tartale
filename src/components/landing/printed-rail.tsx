import type { ReactNode } from 'react';

import {
  BirthdayPrint,
  BrandPrint,
  CAKE_TOPS,
  CoffeePrint,
  MemePrint,
  PrintedCake,
  ProposalPrint,
  RoundPrint,
} from '@/components/landing/printed-cakes';

/** The number printed on the example cakes: a placeholder, not anyone's phone. */
export const EXAMPLE_PHONE = '+34 600 000 000';

const ITEMS: { cake: keyof typeof CAKE_TOPS; name: string; caption: string; print: ReactNode; tilt: string }[] = [
  { cake: 'red-velvet', name: 'Red Velvet', caption: 'para quien no contesta', print: <ProposalPrint phone={EXAMPLE_PHONE} />, tilt: '-1.5deg' },
  { cake: 'lotus', name: 'Lotus', caption: 'para un inversor', print: <RoundPrint />, tilt: '1.2deg' },
  { cake: 'cheesecake', name: 'Cheesecake', caption: 'con vuestra marca', print: <BrandPrint />, tilt: '-0.8deg' },
  { cake: 'chocolate', name: 'Chocolate', caption: 'para romper el hielo', print: <MemePrint />, tilt: '1.6deg' },
  { cake: 'carrot-cake', name: 'Carrot Cake', caption: 'para el equipo', print: <BirthdayPrint />, tilt: '-1.2deg' },
  { cake: 'limon-arandanos', name: 'Limón y Arándanos', caption: 'para un café', print: <CoffeePrint />, tilt: '0.9deg' },
];

/**
 * "Así queda impresa": the bakery's own cakes with prints laid on top, as
 * photos on a string that drifts past. The set is drawn twice so the loop has
 * no seam; the copy is hidden from screen readers. Each item carries its own
 * right padding, so moving the strip by half its width lands exactly on the
 * copy. The motion is CSS (.marquee in globals.css): it pauses under the
 * pointer, and for reduced motion it stops and the strip scrolls by hand.
 */
export function PrintedRail({ bakery }: { bakery: string | null }) {
  return (
    <div className="marquee" role="region" aria-label="Ejemplos de tartas impresas" tabIndex={0}>
      <ul className="marquee-track flex w-max py-6">
        {[...ITEMS, ...ITEMS].map((item, i) => (
          <li key={`${item.cake}-${i}`} aria-hidden={i >= ITEMS.length || undefined} className="pr-6 sm:pr-8">
            <figure className="w-[16rem] bg-white p-2.5 pb-3 shadow-[var(--shadow-lift)] sm:w-[19rem]" style={{ transform: `rotate(${item.tilt})` }}>
              <PrintedCake
                photo={`/cakes/${item.cake}.jpg`}
                top={CAKE_TOPS[item.cake]!}
                alt={`Tarta ${item.name}${bakery ? ` de ${bakery}` : ''}, con un ejemplo impreso encima`}
                sizes="(min-width: 640px) 30rem, 26rem"
                zoom={1.55}
              >
                {item.print}
              </PrintedCake>
              <figcaption className="mt-2.5 text-center font-hand text-[1.35rem] leading-none text-ink-muted">{item.caption}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
