import { CakePreview } from '@/components/cake/cake-preview';
import { CardPreview } from '@/components/card/card-preview';
import type { CardDesign } from '@/lib/cards';
import { cn } from '@/lib/cn';

/**
 * Everything that arrives, in one picture: the cake from above with its
 * printed top, the card leaning on it and, when there is one, the printed
 * document under the card. Built from the same two previews the rest of the
 * site draws, so it always matches them.
 */
export function BoxPreview({
  photo,
  cakeText,
  cardDesign,
  cardMessage,
  signOff,
  to,
  documentName,
  className,
  cardPlaceholder,
  cakePlaceholder,
}: {
  photo: string | null;
  cakeText: string | null;
  cardDesign: CardDesign;
  cardMessage: string;
  signOff: string | null;
  to?: string | null;
  documentName?: string | null;
  className?: string;
  cardPlaceholder?: string;
  cakePlaceholder?: string;
}) {
  return (
    <div className={cn('relative w-full pb-[8%]', className)}>
      {/* The card leans on the cake's edge, clear of what is printed on top. */}
      <div className="w-[74%]">
        <CakePreview photo={photo} text={cakeText} placeholder={cakePlaceholder} />
      </div>

      {documentName ? (
        <div
          role="img"
          aria-label={`El documento impreso: ${documentName}`}
          className="absolute bottom-[22%] right-[3%] flex aspect-[210/297] w-[28%] -rotate-[6deg] flex-col gap-[7%] bg-white px-[9%] pt-[12%] shadow-[0_10px_22px_-12px_rgb(43_24_16_/_0.45)] ring-1 ring-black/5"
        >
          <span className="block h-[3%] w-[70%] rounded-full bg-ink/25" />
          <span className="block h-[2%] w-full rounded-full bg-ink/10" />
          <span className="block h-[2%] w-[92%] rounded-full bg-ink/10" />
          <span className="block h-[2%] w-[85%] rounded-full bg-ink/10" />
          <span className="block h-[2%] w-full rounded-full bg-ink/10" />
          <span className="block h-[2%] w-[60%] rounded-full bg-ink/10" />
        </div>
      ) : null}

      <div className="absolute bottom-0 right-0 w-[34%] rotate-[5deg]">
        <CardPreview
          design={cardDesign}
          message={cardMessage}
          signOff={signOff}
          to={to}
          placeholder={cardPlaceholder}
          className="shadow-[var(--shadow-lift)]"
        />
      </div>
    </div>
  );
}
