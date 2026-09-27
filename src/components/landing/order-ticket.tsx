import { Fragment } from 'react';

import { cn } from '@/lib/cn';

export interface TicketLine {
  label: string;
  value: string;
  /** A handwritten note beside the line (below it, on a phone). */
  note?: string;
}

/** A pen arrow, drawn once, pointing left at the ticket. */
function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 22" aria-hidden className={cn('h-[1.1rem] w-11 shrink-0', className)} fill="none">
      <path d="M46 16c-9-9-24-12-40-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 5.5 5.5 11l7 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * How it works, shown instead of told: the order ticket a bakery receives,
 * filled in with an example, and our notes in the margin. Each line and its
 * note share a grid row, so a line that wraps keeps its note level with it.
 * On a phone the notes are written on the ticket, under their line.
 *
 * On the way in it prints line by line and the notes are written after
 * ("print" in globals.css); each line carries its place as --i.
 */
export function OrderTicket({ title, lines }: { title: string; lines: TicketLine[] }) {
  return (
    <div
      data-reveal="print"
      className="relative -rotate-[0.6deg] font-mono text-[0.8125rem] leading-snug text-[#2b1810] md:grid md:grid-cols-[27rem_minmax(0,1fr)] md:gap-x-5"
    >
      <div aria-hidden className="ticket absolute inset-y-0 left-0 w-full md:w-[27rem]" />

      <div className="relative px-6 pb-5 pt-10 sm:px-8">
        <p className="text-center text-[0.95rem] font-semibold tracking-[0.2em]">TARTALE</p>
        <p className="mt-1 text-center text-[0.72rem] tracking-[0.12em] text-[#6e5747]">{title}</p>
        <hr className="mt-5 border-0 border-t border-dashed border-[#2b1810]/35" />
      </div>
      <div aria-hidden className="hidden md:block" />

      {lines.map((line, i) => (
        <Fragment key={line.label}>
          <div className={cn('relative px-6 sm:px-8', i === lines.length - 1 ? 'pb-10' : 'pb-3.5')}>
            <div className="print-line flex items-baseline gap-2" style={{ '--i': i } as React.CSSProperties}>
              <span className="shrink-0 uppercase tracking-[0.08em] text-[#6e5747]">{line.label}</span>
              <span aria-hidden className="mb-1 min-w-4 flex-1 border-b border-dotted border-[#2b1810]/35" />
              <span className="max-w-[64%] text-right">{line.value}</span>
            </div>
            {line.note ? (
              <p className="pen mt-1.5 font-hand text-[1.3rem] leading-[1.05] text-brand md:hidden" style={{ '--i': i } as React.CSSProperties}>
                ↳ {line.note}
              </p>
            ) : null}
          </div>
          <div aria-hidden className="pen relative hidden items-start gap-1 text-brand md:flex" style={{ '--i': i } as React.CSSProperties}>
            {line.note ? (
              <>
                <Arrow className="-mt-0.5" />
                <span className="-mt-1.5 font-hand text-[1.45rem] leading-none">{line.note}</span>
              </>
            ) : null}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
