import { cn } from '@/lib/cn';

/** Piping around the edge: dots on a ring, in the SVG's 100×100 space. */
const PIPING = Array.from({ length: 40 }, (_, i) => {
  const angle = (i / 40) * Math.PI * 2;
  return { cx: (50 + 41.2 * Math.cos(angle)).toFixed(2), cy: (50 + 41.2 * Math.sin(angle)).toFixed(2) };
});

/**
 * The cake seen from above, as it will arrive: the photo printed on top and
 * the line of text over it. A sketch, not a promise — the bakery confirms how
 * the print will look — and the pages that show it say so.
 *
 * Pure markup with no hooks and no SVG ids, so any number of cakes can share
 * a page: the order form, the tracking page, the panel and the landing page
 * all draw the same one.
 */
export function CakePreview({
  photo,
  text,
  className,
  label = 'Vista previa de la tarta',
}: {
  photo: string | null;
  text: string | null;
  className?: string;
  label?: string;
}) {
  const hasText = Boolean(text && text.trim());
  return (
    <figure
      aria-label={label}
      className={cn('@container relative mx-auto aspect-square w-full max-w-[22rem] select-none', className)}
    >
      {/* The board it sits on, and the frosted top. */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,#ffffff_86%,#efe6da_100%)] shadow-[0_20px_36px_-14px_rgb(43_24_16_/_0.35)]"
      />
      <div
        aria-hidden
        className="absolute inset-[4.5%] rounded-full bg-[radial-gradient(circle_at_42%_38%,#fffaf2_0%,#f6e9d7_70%,#ecd9c1_100%)]"
      />
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 h-full w-full">
        {PIPING.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r="2.35" fill="#fffdf8" stroke="#e7d3ba" strokeWidth="0.35" />
        ))}
      </svg>

      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local data URL or a same-origin file
        <img
          src={photo}
          alt="La foto impresa en la tarta"
          className="absolute left-[16%] top-[16%] h-[68%] w-[68%] rounded-full object-cover"
        />
      ) : null}

      {hasText ? (
        <figcaption
          className={cn(
            'absolute inset-x-[21%] text-balance text-center font-display font-semibold leading-[1.08] break-words',
            photo
              ? 'bottom-[22%] text-[clamp(0.75rem,6.4cqw,1.55rem)] text-white [text-shadow:0_1px_0_rgb(0_0_0_/_0.55),0_0_10px_rgb(0_0_0_/_0.45)]'
              : 'top-1/2 -translate-y-1/2 text-[clamp(0.9rem,8cqw,2rem)] text-[#7a3b2a]',
          )}
        >
          {text}
        </figcaption>
      ) : null}

      {!photo && !hasText ? (
        <figcaption className="absolute inset-x-[24%] top-1/2 -translate-y-1/2 text-center text-[clamp(0.75rem,4.6cqw,1rem)] text-ink-subtle">
          Tu foto y tu frase, aquí
        </figcaption>
      ) : null}
    </figure>
  );
}
