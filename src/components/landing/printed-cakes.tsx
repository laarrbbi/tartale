import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Where the flat top of each cake is in its photo: the centre and the two
 * radii of the ellipse inside the piping, as percentages of the (square)
 * photo. Measured by eye on the bakery's photos in public/cakes.
 */
export interface CakeTop {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export const CAKE_TOPS: Record<string, CakeTop> = {
  'red-velvet': { cx: 50, cy: 38.5, rx: 24, ry: 17 },
  chocolate: { cx: 50, cy: 41, rx: 21.5, ry: 16.5 },
  lotus: { cx: 49.5, cy: 30, rx: 24.5, ry: 13.5 },
  cheesecake: { cx: 52, cy: 43.5, rx: 28.5, ry: 21.5 },
  'carrot-cake': { cx: 48.5, cy: 45, rx: 19.5, ry: 12.5 },
  'limon-arandanos': { cx: 50.7, cy: 44, rx: 19, ry: 11 },
};

/**
 * A bakery photo with a print laid on its top: the design is drawn flat, in
 * a circle, and tilted back in 3D until it matches the ellipse of the cake's
 * top, so it sits the way an edible print sits. A mock-up, and the section
 * that shows these says so. `zoom` moves in on the top (photo and print
 * together, so they stay aligned).
 */
export function PrintedCake({
  photo,
  top,
  alt,
  children,
  className,
  sizes = '18rem',
  zoom = 1,
}: {
  photo: string;
  top: CakeTop;
  alt: string;
  children: ReactNode;
  className?: string;
  sizes?: string;
  zoom?: number;
}) {
  const tilt = (Math.acos(Math.min(1, top.ry / top.rx)) * 180) / Math.PI;
  const disc: CSSProperties = {
    left: `${top.cx - top.rx}%`,
    top: `${top.cy - top.rx}%`,
    width: `${top.rx * 2}%`,
    height: `${top.rx * 2}%`,
    transform: `perspective(1200px) rotateX(${tilt.toFixed(1)}deg)`,
  };
  return (
    <figure className={cn('relative aspect-square overflow-hidden', className)}>
      <div className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: `${top.cx}% ${top.cy}%` }}>
        <Image src={photo} alt={alt} fill sizes={sizes} className="object-cover" />
        <div aria-hidden className="@container absolute overflow-hidden rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" style={disc}>
          {children}
          {/* The sheen of a sugar sheet under the light. */}
          <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_22%,rgb(255_255_255/0.28),transparent_55%)]" />
        </div>
      </div>
    </figure>
  );
}

/* ----------------------------------------------------------------- Designs */
/* Each fills its circle; sizes are in cqw of the circle, so they scale with it. */

/** «Contáctame, tengo una propuesta» and a number: the one in the film. */
export function ProposalPrint({ phone }: { phone: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#1f2a44] px-[12cqw] text-center text-[#f5e6d3]">
      <p className="font-display text-[15cqw] font-semibold leading-[0.95] tracking-[-0.02em]">Contáctame</p>
      <p className="mt-[3cqw] font-display text-[8.5cqw] italic leading-none text-[#f3b6c5]">tengo una propuesta</p>
      <p className="mt-[6cqw] rounded-full bg-[#f5e6d3] px-[5cqw] py-[1.8cqw] text-[6.8cqw] font-bold tracking-[0.02em] text-[#1f2a44] tabular-nums">
        {phone}
      </p>
    </div>
  );
}

/** A funding round: the company's mark and the good news. */
export function RoundPrint() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_30%,#fff7d6,#ffd54a_70%)] px-[10cqw] text-center text-[#2b1810]">
      <p className="text-[6.5cqw] font-bold uppercase tracking-[0.12em]">¡Enhorabuena</p>
      <p className="text-[6.5cqw] font-bold uppercase tracking-[0.12em]">por la ronda!</p>
      <svg viewBox="0 0 120 120" className="mt-[4cqw] h-[30cqw] w-[30cqw]" aria-hidden>
        <circle cx="60" cy="60" r="44" fill="none" stroke="#1f2a44" strokeWidth="11" />
        <path d="M40 84V36l40 48V36" fill="none" stroke="#1f2a44" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="mt-[2cqw] font-display text-[11cqw] font-bold tracking-[0.18em] text-[#1f2a44]">NUBO</p>
    </div>
  );
}

/** A product line and a mark on a strong colour, like a label. */
export function BrandPrint() {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-[#2f6f4f] text-[#f4f1e6]">
      <svg viewBox="0 0 100 100" className="h-[34cqw] w-[34cqw]" aria-hidden>
        <path d="M20 70 50 22 80 70Z" fill="none" stroke="currentColor" strokeWidth="9" strokeLinejoin="round" />
        <circle cx="50" cy="56" r="8" fill="currentColor" />
      </svg>
      <p className="absolute top-[17cqw] font-display text-[9cqw] italic">Cobra antes.</p>
      <p className="absolute bottom-[16cqw] text-[6cqw] font-bold uppercase tracking-[0.3em]">brisa</p>
    </div>
  );
}

/** A meme, because sometimes that is the message. */
export function MemePrint() {
  return (
    <div className="relative h-full w-full">
      <Image src="/samples/meme.svg" alt="" fill sizes="10rem" className="object-cover" />
      <p className="absolute inset-x-[14cqw] bottom-[13cqw] text-center font-display text-[9.5cqw] font-bold leading-[1.02] text-white [text-shadow:0_1px_0_rgb(0_0_0/0.6),0_0_8px_rgb(0_0_0/0.5)]">
        Mejor que otro email
      </p>
    </div>
  );
}

/** A team photo and a birthday. */
export function BirthdayPrint() {
  return (
    <div className="relative h-full w-full">
      <Image src="/samples/equipo.svg" alt="" fill sizes="10rem" className="object-cover" />
      <p className="absolute inset-x-[12cqw] bottom-[14cqw] text-center font-display text-[10cqw] font-bold leading-none text-white [text-shadow:0_1px_0_rgb(0_0_0/0.5)]">
        ¡Feliz cumple, Marta!
      </p>
    </div>
  );
}

/** Just a line, in handwriting, for a coffee. */
export function CoffeePrint() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#fffaf1] px-[12cqw] text-center text-[#7a3b2a]">
      <p className="font-hand text-[17cqw] leading-[0.95]">¿Un café esta semana?</p>
      <p className="mt-[4cqw] text-[6cqw] font-semibold uppercase tracking-[0.2em] text-[#2b1810]/70">Pablo · Nubo</p>
    </div>
  );
}
