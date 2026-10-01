import { CakeMark } from '@/components/site/logo';
import { messageSize, type CardDesign } from '@/lib/cards';
import { cn } from '@/lib/cn';

/**
 * The card that goes in the box, drawn the same everywhere it appears: the
 * order form's live preview, the tracking page, the panel and the A6 print.
 * Sizes are in container units (cqw), so the card scales as a whole; on
 * paper the container is 105 mm wide and every size lands where it did on
 * screen.
 *
 * `signOff` null means anonymous: the card says nothing about who sent it.
 */
export function CardPreview({
  design,
  message,
  signOff,
  to,
  className,
  placeholder = 'Aquí va tu mensaje.',
  label,
}: {
  design: CardDesign;
  message: string;
  signOff: string | null;
  to?: string | null;
  className?: string;
  placeholder?: string;
  label?: string;
}) {
  const text = message.trim() || placeholder;
  const empty = !message.trim();
  const size = messageSize(design, text);
  const recipient = to?.trim() ? to.trim().split(/\s+/)[0] : null;

  return (
    <div className={cn('@container w-full', className)}>
      <figure
        aria-label={label ?? `Tarjeta, diseño ${design}`}
        className={cn(
          'card-print relative flex aspect-[105/148] w-full select-none flex-col overflow-hidden',
          design === 'clasica' && 'bg-[#fffaf1] text-[#2b1810]',
          design === 'mano' && 'card-kraft text-[#2a2016]',
          design === 'color' && 'bg-[#b02e55] text-[#fffdfa]',
        )}
      >
        {design === 'clasica' ? (
          <>
            <span aria-hidden className="absolute inset-[4.5cqw] border-[0.35cqw] border-[#2b1810]/30" />
            <span aria-hidden className="absolute inset-[6cqw] border-[0.18cqw] border-[#2b1810]/25" />
            <div className="relative flex flex-1 flex-col items-center justify-between px-[13cqw] py-[15cqw] text-center">
              <p className="font-display text-[5cqw] italic text-[#6e5747]">{recipient ? `Para ${recipient}` : ' '}</p>
              <p
                className={cn('whitespace-pre-line text-balance font-display leading-[1.3]', empty && 'text-[#2b1810]/40')}
                style={{ fontSize: `${size}cqw` }}
              >
                {text}
              </p>
              <div className="flex flex-col items-center gap-[4cqw]">
                <p className="font-display text-[5.2cqw] italic">{signOff ? `— ${signOff}` : ' '}</p>
                <CakeMark className="h-[7cqw] w-[7cqw] opacity-60" />
              </div>
            </div>
          </>
        ) : null}

        {design === 'mano' ? (
          <div className="relative flex flex-1 -rotate-[1.2deg] flex-col px-[11cqw] pb-[12cqw] pt-[13cqw] font-hand">
            <p className="text-[7.4cqw] leading-none">{recipient ? `Para ${recipient},` : ' '}</p>
            <p
              className={cn('mt-[6cqw] flex-1 whitespace-pre-line leading-[1.12]', empty && 'text-[#2a2016]/45')}
              style={{ fontSize: `${size}cqw` }}
            >
              {text}
            </p>
            <p className="self-end pr-[2cqw] text-[8.6cqw] leading-none">{signOff ?? ' '}</p>
            {/* A rubber stamp, the way a bakery marks its boxes. */}
            <span
              aria-hidden
              className="absolute bottom-[9cqw] left-[10cqw] grid h-[17cqw] w-[17cqw] rotate-[-14deg] place-items-center rounded-full border-[0.6cqw] border-[#b02e55]/70 font-display text-[3.6cqw] font-semibold italic text-[#b02e55]/75"
            >
              Tartame
            </span>
          </div>
        ) : null}

        {design === 'color' ? (
          <div className="relative flex flex-1 flex-col px-[10cqw] pb-[10cqw] pt-[6cqw]">
            <span aria-hidden className="font-display text-[34cqw] leading-[0.9] text-[#f5e6d3]/90">
              “
            </span>
            <p className="-mt-[6cqw] text-[4.6cqw] font-semibold text-[#f5e6d3]">{recipient ? `Para ${recipient}` : ' '}</p>
            <p
              className={cn('mt-[4cqw] flex-1 whitespace-pre-line font-bold leading-[1.12] tracking-[-0.01em]', empty && 'text-white/55')}
              style={{ fontSize: `${size}cqw` }}
            >
              {text}
            </p>
            <div className="flex items-end justify-between gap-[4cqw]">
              <p className="text-[5cqw] font-medium">{signOff ? `— ${signOff}` : ' '}</p>
              <CakeMark className="h-[8cqw] w-[8cqw] shrink-0" />
            </div>
          </div>
        ) : null}
      </figure>
    </div>
  );
}
