const SENT = [
  { subject: 'Propuesta Nubo', snippet: 'Hola Marta, ¿pudiste ver nuestra propuesta?', date: '2 oct' },
  { subject: 'Re: Propuesta Nubo', snippet: 'Solo quería volver a escribirte…', date: '9 oct' },
  { subject: 'Re: Re: Propuesta Nubo', snippet: '¿Te viene mejor la semana que viene?', date: '16 oct' },
] as const;

/**
 * Cold email against cold cake: a sent folder with three follow-ups nobody
 * answered, and the one message a cake on the desk might bring. An
 * illustration of the idea, not a quote from anyone. On the way in the
 * follow-ups pile up, the silence shows, and then the reply drops in.
 */
export function ChatCompare() {
  return (
    <div data-reveal="mail" className="grid items-center gap-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
      <div className="overflow-hidden rounded-[10px] bg-white text-[#2f2f2f] shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-18px_rgb(43_24_16/0.35)] ring-1 ring-black/[0.06]">
        <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-2.5 text-[0.78rem] text-[#6b6b6b]">
          <span className="font-semibold text-[#3a3a3a]">Enviados</span>
          <span>Para: Marta Ruiz</span>
        </div>
        <ul>
          {SENT.map((mail, i) => (
            <li
              key={mail.date}
              className="mail-row flex items-baseline gap-3 border-b border-black/[0.05] px-4 py-3 last:border-0"
              style={{ '--i': i } as React.CSSProperties}
            >
              <span className="min-w-0 flex-1 truncate text-[0.85rem]">
                <span className="font-semibold">{mail.subject}</span>
                <span className="text-[#7a7a7a]"> — {mail.snippet}</span>
              </span>
              <span className="shrink-0 text-[0.75rem] text-[#7a7a7a]">{mail.date}</span>
            </li>
          ))}
        </ul>
        <p className="mail-silence bg-[#f6f6f6] px-4 py-2 text-[0.75rem] italic text-[#8a8a8a]">Sin respuesta.</p>
      </div>

      <div className="flex flex-col gap-3 md:pt-6">
        <p className="mail-pen -rotate-2 font-hand text-[1.6rem] leading-none text-brand">y con una tarta en su mesa…</p>
        <div className="mail-reply rounded-[20px] bg-white/90 p-4 shadow-[var(--shadow-lift)] ring-1 ring-black/[0.05]">
          <p className="flex items-center justify-between text-[0.72rem] text-[#7a7a7a]">
            <span>Mensajes</span>
            <span>ahora</span>
          </p>
          <p className="mt-1 text-[0.92rem] font-semibold text-[#1d1d1d]">Marta Ruiz</p>
          <p className="text-[0.92rem] leading-snug text-[#1d1d1d]">
            ¡Una tarta con vuestro logo! Y la tarjeta me ha hecho reír. ¿Hablamos el jueves?
          </p>
        </div>
      </div>
    </div>
  );
}
