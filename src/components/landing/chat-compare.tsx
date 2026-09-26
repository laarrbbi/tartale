import { cn } from '@/lib/cn';

function Bubble({ children, from = 'me', delay = 0 }: { children: React.ReactNode; from?: 'me' | 'them'; delay?: number }) {
  return (
    <p
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        'bubble-in w-fit max-w-[88%] px-3.5 py-2 text-[0.9rem] leading-snug',
        from === 'me'
          ? 'ml-auto rounded-[18px] rounded-br-[6px] bg-[#2f6fed] text-white'
          : 'rounded-[18px] rounded-bl-[6px] bg-[#ece3d6] text-ink',
      )}
    >
      {children}
    </p>
  );
}

/**
 * Cold email against cold cake, as two chats. An illustration of the idea,
 * not a quote from anyone: the page says "puede pasar", never "pasa".
 */
export function ChatCompare() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2 rounded-card bg-surface p-5 ring-1 ring-line/70">
        <p className="type-eyebrow text-ink-subtle">Un email</p>
        <p className="type-caption">Para: marta@fondo.vc</p>
        <div className="mt-2 flex flex-col gap-2">
          <Bubble>Hola Marta, ¿pudiste ver nuestra propuesta?</Bubble>
          <Bubble delay={120}>Solo quería volver a escribirte 🙏</Bubble>
          <Bubble delay={240}>¿Te viene mejor la semana que viene?</Bubble>
        </div>
        <p className="mt-auto pt-3 text-right text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
          Enviado · sin respuesta
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-card bg-surface p-5 shadow-[var(--shadow-lift)] ring-2 ring-chocolate">
        <p className="type-eyebrow">Una tarta</p>
        <p className="type-caption">En recepción, con su nombre</p>
        <div className="mt-2 flex flex-col gap-2">
          <Bubble>Te hemos dejado algo en recepción 🎂</Bubble>
          <Bubble from="them" delay={160}>
            ¡Qué detalle! Me ha encantado la foto 😂 ¿Hablamos el jueves?
          </Bubble>
        </div>
        <p className="mt-auto pt-3 text-right text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-brand">
          Respondido
        </p>
      </div>
    </div>
  );
}
