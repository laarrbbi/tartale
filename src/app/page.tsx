import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import { CardPreview } from '@/components/card/card-preview';
import { ChatCompare } from '@/components/landing/chat-compare';
import { HeroFilm } from '@/components/landing/hero-film';
import { OrderTicket, type TicketLine } from '@/components/landing/order-ticket';
import { CAKE_TOPS, PrintedCake, ProposalPrint } from '@/components/landing/printed-cakes';
import { EXAMPLE_PHONE, PrintedRail } from '@/components/landing/printed-rail';
import { RevealOnScroll } from '@/components/motion/reveal-on-scroll';
import { BoxPreview } from '@/components/order/box-preview';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ButtonLink } from '@/components/ui/button';
import { LEGAL } from '@/lib/brand';
import { ORDER_DOCUMENT, type CardDesign } from '@/lib/cards';
import { RETENTION_DAYS } from '@/lib/constants';
import { formatBytes } from '@/lib/format';
import { formatEuros, fromPrice, priceFor } from '@/lib/orders';
import { whatsappLink } from '@/lib/whatsapp';
import { formatPostcodes } from '@/lib/zones';
import { DEFAULT_SETTINGS, getSettings, type Settings } from '@/server/repositories/settings';
import { citiesOf, publicMenus, type PublicMenu } from '@/server/services/catalog-service';

/** The menus and settings, or nothing if the database is unreachable: the page must still render. */
async function load(): Promise<{ menus: PublicMenu[]; settings: Settings }> {
  try {
    const [menus, settings] = await Promise.all([publicMenus(), getSettings()]);
    return { menus, settings };
  } catch (error) {
    console.error('[home] catalog unavailable', error);
    return { menus: [], settings: DEFAULT_SETTINGS };
  }
}

/** A custom property for the motion in globals.css (a delay, an index). */
const vars = (values: Record<string, number>) => values as CSSProperties;

/** Each word in its own mask, rising in turn; screen readers get the sentence as it is. */
function Words({ text, from = 0 }: { text: string; from?: number }) {
  return text.split(' ').map((word, i) => (
    <span key={i}>
      {i > 0 ? ' ' : null}
      <span className="word-mask">
        <span className="word" style={vars({ '--i': from + i })}>
          {word}
        </span>
      </span>
    </span>
  ));
}

/** What people send: illustrations of the idea, not orders or quotes. */
const EXAMPLES: {
  photo: string;
  text: string;
  card: { design: CardDesign; to: string; message: string; signOff: string };
  document?: string;
  caption: string;
  tilt: string;
}[] = [
  {
    photo: '/samples/logo.svg',
    text: '¿Un café esta semana?',
    card: { design: 'clasica', to: 'Marta', message: 'Nos encantaría contarte lo que estamos construyendo.', signOff: 'Pablo, de Nubo' },
    caption: 'para un inversor',
    tilt: '-2deg',
  },
  {
    photo: '/samples/meme.svg',
    text: 'Mejor que otro email',
    card: { design: 'mano', to: 'Lucía', message: 'Me encantaría trabajar con vosotras. Mi CV va en la caja.', signOff: 'Andrés' },
    document: 'CV_Andres.pdf',
    caption: 'con el CV dentro',
    tilt: '1.5deg',
  },
  {
    photo: '/samples/equipo.svg',
    text: '¡Feliz cumple, Marta!',
    card: { design: 'color', to: 'Marta', message: 'De parte de todo el equipo. Que cumplas muchos más.', signOff: 'Nubo' },
    caption: 'para el equipo',
    tilt: '-1deg',
  },
];

const AUDIENCES = [
  'Para el cliente que no contesta.',
  'Para el inversor al que quieres llegar.',
  'Para la empresa donde quieres trabajar.',
  'Para el socio con el que quieres empezar.',
] as const;

export default async function HomePage() {
  const { menus, settings } = await load();
  const menu = menus[0] ?? null;
  const cities = citiesOf(menus);
  const cakes = menus.flatMap((m) => m.cakes);
  const bakery = menu?.bakery.name ?? null;
  const city = menu?.city ?? 'Alicante';

  const cheapest = cakes.map((c) => fromPrice(c.prices)).filter((p): p is number => p !== null);
  const fromCents = cheapest.length ? Math.min(...cheapest) : null;
  const deliveries = [...new Set(cities.flatMap((c) => c.deliveryCents))].sort((a, b) => a - b);
  const menuPhoto = cakes.find((c) => c.name === 'Lotus' && c.photo) ?? cakes.find((c) => c.photo) ?? null;
  const example = cakes.find((c) => c.name === 'Lotus') ?? cakes.find((c) => priceFor(c.prices, 'mediana') !== null) ?? null;
  const examplePrice = example ? priceFor(example.prices, 'mediana') : null;
  const exampleTotal = examplePrice !== null && deliveries.length ? examplePrice + deliveries[0]! : null;

  const contact = whatsappLink(settings.whatsappNumber, 'Hola, queremos tartas para los cumpleaños del equipo');
  const contactEmail = LEGAL.email ? `mailto:${LEGAL.email}?subject=Cumplea%C3%B1os%20del%20equipo` : null;
  const notice =
    settings.minNoticeDays === 0 ? 'para hoy mismo' : settings.minNoticeDays === 1 ? 'para mañana' : `con ${settings.minNoticeDays} días de antelación`;

  const ticket: TicketLine[] = [
    { label: 'Para', value: 'Marta R. · Fondo Mediterráneo', note: 'tú dices a quién' },
    { label: 'Dónde', value: 'Av. Maisonnave 11, 4ª planta', note: 'a su oficina, o a su casa' },
    { label: 'Cuándo', value: 'jueves · por la mañana', note: 'el día y la franja que elijas' },
    {
      label: 'Tarta',
      value: example ? `${example.name} · mediana` : 'de la carta · mediana',
      note: bakery ? `la hace ${bakery}` : 'la hace una pastelería de verdad',
    },
    { label: 'Encima', value: 'logo de Nubo + «¿Un café esta semana?»', note: 'impreso en la tarta' },
    { label: 'Tarjeta', value: 'a mano · «Nos encantaría contarte…»', note: 'la escribes tú' },
    { label: 'En la caja', value: '+ CV_Pablo_Gil.pdf, impreso', note: '¿tu CV? lo imprimimos' },
    ...(exampleTotal !== null ? [{ label: 'Total', value: formatEuros(exampleTotal), note: 'y lo sigues desde un enlace' }] : []),
  ];

  const faq = [
    {
      q: '¿Cuánto cuesta?',
      a:
        fromCents !== null && deliveries.length
          ? `La tarta, desde ${formatEuros(fromCents)} según el sabor y el tamaño; la entrega, ${deliveries.map(formatEuros).join(' o ')}. Ves el total antes de pagar.`
          : 'Depende del sabor y del tamaño, más la entrega. Ves el total antes de pagar.',
    },
    {
      q: '¿Qué lleva la tarta?',
      a: 'Encima, la foto que subas —un logo, una foto vuestra, un meme— y una frase corta, impresas. Puedes poner solo la frase, o nada.',
    },
    {
      q: '¿Y en la caja?',
      a: `Tu tarjeta, impresa en el diseño que elijas. Si subes un documento —un CV, una propuesta, un dossier; PDF, JPG o PNG de hasta ${formatBytes(ORDER_DOCUMENT.maxBytes)}—, lo imprimimos y va dentro.`,
    },
    { q: '¿Puede ir sin firmar?', a: 'Sí. La tarjeta puede ir anónima: no dirá quién la envía.' },
    { q: '¿Cómo se paga?', a: 'Con tarjeta al hacer el pedido, en la página segura de Stripe. Si no podemos entregarla, te devolvemos el dinero.' },
    { q: '¿Con cuánta antelación?', a: `Puedes pedirla ${notice}. Eliges el día y si la quieres por la mañana o por la tarde.` },
    {
      q: '¿Y si tiene alguna alergia?',
      a: 'Dilo en el pedido. Si la pastelería no puede adaptar la tarta, te lo decimos antes de hacerla y te devolvemos el dinero.',
    },
    {
      q: '¿Qué hacéis con sus datos?',
      a: `Solo los usamos para entregarle la tarta. Nunca le escribimos ni le mandamos publicidad, y ${RETENTION_DAYS.orders} días después de la entrega borramos sus datos, la tarjeta, la foto y el documento.`,
    },
    { q: '¿Puedo ver por dónde va?', a: 'Sí: al pagar tienes un enlace privado con el estado del pedido, desde que lo recibimos hasta que se entrega.' },
    { q: '¿Hacéis los cumpleaños de un equipo?', a: 'Sí, para empresas y bajo petición: nos pasáis la lista una vez y cada tarta se pide sola una semana antes.' },
  ];

  return (
    <>
      <SiteHeader />
      <main id="main" className="overflow-x-clip">
        {/* ---------------------------------------------------------------- Hero */}
        <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-[#1a0f0a] text-[#fffaf3]">
          {/* On a phone the film fills the top and the words sit under it; on a wide screen it fills everything. */}
          <HeroFilm className="hero-film absolute inset-x-0 top-0 -z-20 h-[62%] w-full object-cover object-[70%_30%] md:inset-0 md:h-full md:object-[60%_30%]" />
          {/* Shade where the words are: from the bottom on a phone, from the left on a wide screen. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgb(26_15_10)_0%,rgb(26_15_10)_40%,rgb(26_15_10/0.55)_52%,rgb(26_15_10/0)_66%)] md:bg-[linear-gradient(90deg,rgb(26_15_10/0.92)_0%,rgb(26_15_10/0.7)_36%,rgb(26_15_10/0)_64%)]"
          />

          <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col justify-end px-5 pb-12 pt-40 md:min-h-[44rem] md:justify-center md:pb-20 md:pt-20">
            {/* The story of the film, with times: an example, not a promise. On a phone the film tells it alone. */}
            <ol
              aria-label="Lo que pasa cuando llega"
              className="hidden text-[0.8125rem] text-[#f5e6d3] md:absolute md:right-6 md:flex md:top-12 md:mb-0 md:flex-col md:items-end md:gap-2 lg:right-10"
            >
              {[
                { time: '10:02', text: 'Madrid. Otra llamada de las malas', d: 900 },
                { time: '10:05', text: 'Le llega tu tarta: «Contáctame»', d: 2200 },
              ].map((tick) => (
                <li
                  key={tick.time}
                  className="hero-tick flex items-center gap-2 rounded-pill bg-[#1a0f0a]/60 px-3 py-1.5 backdrop-blur-[6px]"
                  style={vars({ '--d': tick.d })}
                >
                  <span className="type-numeric font-semibold text-[#fffaf3]">{tick.time}</span>
                  <span>{tick.text}</span>
                </li>
              ))}
              <li
                className="hero-tick flex items-center gap-2 rounded-pill bg-[#fffaf3] px-3 py-1.5 font-semibold text-[#1a0f0a] shadow-[var(--shadow-lift)]"
                style={vars({ '--d': 3600 })}
              >
                <span aria-hidden className="ring-dot h-2 w-2 rounded-full bg-[#2e9d5b] text-[#2e9d5b]" />
                <span className="type-numeric">10:06</span>
                <span>Te llama</span>
              </li>
            </ol>

            <h1 id="hero-title" className="type-hero hero-title max-w-[13ch] text-balance text-[#fffaf3] md:max-w-[11ch]">
              <Words text="Un email se ignora." />{' '}
              <span className="italic text-[#f3b6c5]">
                <Words text="Una tarta, no." from={4} />
              </span>
            </h1>
            <p className="hero-tick mt-6 max-w-[31rem] text-[1.0625rem] leading-relaxed text-pretty text-[#f5e6d3]" style={vars({ '--d': 700 })}>
              Tu logo o tu foto impresos en una tarta de pastelería, una tarjeta escrita por ti y, si quieres, tu CV en la caja. En su
              oficina, el día que elijas.
            </p>
            <div className="hero-tick mt-8 flex flex-wrap items-center gap-x-6 gap-y-3" style={vars({ '--d': 900 })}>
              <ButtonLink href="/enviar" size="lg">
                Enviar una tarta
              </ButtonLink>
              <Link href="#como-funciona" className="type-body font-medium text-[#fffaf3] underline decoration-white/40 underline-offset-4 hover:decoration-white">
                Así es un pedido
              </Link>
            </div>
            {fromCents !== null && deliveries.length ? (
              <p className="hero-tick mt-6 text-[0.8125rem] text-[#f5e6d3]/75" style={vars({ '--d': 1100 })}>
                En {city}. Tarta desde {formatEuros(fromCents)}, entrega {deliveries.map(formatEuros).join(' o ')}.{' '}
                <Link href="/zonas" className="underline underline-offset-2 hover:text-[#fffaf3]">
                  Dónde entregamos
                </Link>
              </p>
            ) : null}
          </div>

          {/* What arrived: the cake from the film, as a photo landing on the table. */}
          <figure
            className="hero-card absolute bottom-10 right-6 hidden w-[14rem] rotate-[-4deg] bg-white p-2 pb-2.5 shadow-[var(--shadow-lift)] lg:right-10 lg:block xl:w-[16rem]"
            style={vars({ '--d': 1500 })}
          >
            <PrintedCake
              photo="/cakes/red-velvet.jpg"
              top={CAKE_TOPS['red-velvet']!}
              alt={`Tarta Red Velvet${bakery ? ` de ${bakery}` : ''} con «Contáctame, tengo una propuesta» impreso encima`}
              sizes="26rem"
              zoom={1.55}
            >
              <ProposalPrint phone={EXAMPLE_PHONE} />
            </PrintedCake>
            <figcaption className="mt-2 text-center font-hand text-[1.25rem] leading-none text-ink-muted">lo que le llega</figcaption>
          </figure>
        </section>

        {/* --------------------------------------------------- How it looks */}
        <section aria-labelledby="asi-queda" className="overflow-hidden border-b border-line py-14 md:py-20">
          <div data-reveal="rise" className="mx-auto flex max-w-6xl flex-col gap-3 px-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 id="asi-queda" className="type-display text-balance">
                Así queda impresa.
              </h2>
              <p className="type-lead mt-3 max-w-xl text-pretty">
                Tu logo, tu foto o tu frase, encima de una tarta de la carta{bakery ? ` de ${bakery}` : ''}.
              </p>
            </div>
            <p className="type-caption md:max-w-[16rem] md:text-right">Montajes de ejemplo sobre fotos de las tartas de la carta.</p>
          </div>
          <div className="mt-8 md:mt-10">
            <PrintedRail bakery={bakery} />
          </div>
        </section>

        {/* ----------------------------------------------------- Email vs cake */}
        <section aria-labelledby="emails" className="border-b border-line bg-surface-sunken/70 py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-5">
            <div data-reveal="rise">
              <h2 id="emails" className="type-display max-w-xl text-balance">
                Llevas tres emails sin respuesta.
              </h2>
              <p className="type-lead mt-3 max-w-xl text-pretty">Una tarta en su mesa no se queda en la bandeja de entrada.</p>
            </div>
            <div className="mt-12">
              <ChatCompare />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ How it works */}
        <section id="como-funciona" aria-labelledby="pedido" className="scroll-mt-20 bg-vanilla/70 py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[18rem_1fr] lg:gap-16">
            <div data-reveal="rise">
              <h2 id="pedido" className="type-display text-balance">
                Así es un pedido
              </h2>
              <p className="type-body mt-4 text-pretty text-ink-muted">
                Un pedido de ejemplo, con nuestras notas al margen. Tú lo rellenas desde el móvil en tres pasos y pagas al final.
              </p>
              <ButtonLink href="/enviar" variant="dark" className="mt-7 hidden lg:inline-flex">
                Hacer el mío
              </ButtonLink>
            </div>
            <OrderTicket title="COMANDA · PEDIDO DE EJEMPLO" lines={ticket} />
          </div>
        </section>

        {/* ------------------------------------------------ What is printed */}
        <section aria-labelledby="impreso" className="py-16 md:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <div data-reveal="rise" className="max-w-2xl">
              <h2 id="impreso" className="type-display text-balance">
                Tu logo en la tarta. <span className="italic">Tus palabras en la tarjeta.</span>
              </h2>
              <p className="type-lead mt-4 text-pretty">
                Encima imprimimos un logo, una foto o un meme, con una frase corta. Dentro va la tarjeta, en uno de tres diseños, y tu
                CV si quieres. Lo ves todo mientras lo haces.
              </p>
            </div>
            <ul data-reveal="deal" className="mt-16 grid gap-14 sm:grid-cols-3 sm:gap-6 lg:gap-10">
              {EXAMPLES.map((ex, i) => (
                <li key={ex.caption} style={vars({ '--i': i })}>
                  <figure className="on-table mx-auto w-full max-w-[20rem]" style={{ transform: `rotate(${ex.tilt})` }}>
                    <BoxPreview
                      photo={ex.photo}
                      cakeText={ex.text}
                      cardDesign={ex.card.design}
                      cardMessage={ex.card.message}
                      signOff={ex.card.signOff}
                      to={ex.card.to}
                      documentName={ex.document ?? null}
                    />
                    <figcaption className="mt-5 text-center font-hand text-[1.5rem] leading-none text-ink-muted">{ex.caption}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
            <p className="type-caption mt-12 text-center">Ejemplos. La vista previa del pedido te enseña el tuyo.</p>
          </div>
        </section>

        {/* ---------------------------------------------------------- The menu */}
        {cakes.length > 0 ? (
          <section aria-labelledby="carta" className="border-t border-line py-16 md:py-24">
            <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[1fr_20rem] md:gap-16">
              <div>
                <div data-reveal="rise">
                  <h2 id="carta" className="type-display text-balance">
                    {bakery ? `La carta de ${bakery}` : 'La carta'}
                  </h2>
                  <p className="type-body mt-3 max-w-xl text-pretty text-ink-muted">
                    Tartas de pastelería{menu ? `, hechas en ${menu.city}` : ''}. Tres tamaños; el precio que ves es el del más pequeño
                    {deliveries.length ? ` y la entrega va aparte (${deliveries.map(formatEuros).join(' o ')})` : ''}.
                  </p>
                </div>
                <ul data-reveal="stagger" className="mt-9 flex flex-col">
                  {cakes.map((cake, i) => {
                    const from = fromPrice(cake.prices);
                    return (
                      <li key={cake.id} className="flex items-center gap-4 border-b border-line py-3.5 first:border-t" style={vars({ '--i': i })}>
                        {cake.photo ? (
                          <Image src={cake.photo} alt="" width={96} height={96} className="h-12 w-12 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span aria-hidden className="h-12 w-12 shrink-0 rounded-full bg-vanilla" />
                        )}
                        <span className="font-display text-[1.2rem] leading-tight">{cake.name}</span>
                        <span aria-hidden className="mb-1.5 min-w-6 flex-1 self-end border-b border-dotted border-ink/25" />
                        <span className="type-numeric shrink-0 text-[0.95rem] text-ink-muted">{from !== null ? `desde ${formatEuros(from)}` : ''}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {menuPhoto?.photo ? (
                <figure data-reveal="rise" className="hidden md:block" style={vars({ '--d': 200 })}>
                  <Image
                    src={menuPhoto.photo}
                    alt={bakery ? `Tarta ${menuPhoto.name} de ${bakery}` : `Tarta ${menuPhoto.name}`}
                    width={930}
                    height={930}
                    sizes="20rem"
                    className="aspect-[4/5] w-full rounded-[4px] object-cover"
                  />
                  <figcaption className="type-caption mt-3">
                    {menuPhoto.name}
                    {bakery ? `, de ${bakery}` : ''}.
                  </figcaption>
                </figure>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* ---------------------------------------------------------- For whom */}
        <section aria-label="Para quién" className="bg-chocolate py-16 text-ink-inverse md:py-24">
          <div className="mx-auto max-w-5xl px-5">
            <ul data-reveal="mask">
              {AUDIENCES.map((line, i) => (
                <li key={line} className="mask-line border-b border-white/10 py-4 font-display text-[clamp(1.5rem,4.6vw,2.6rem)] leading-[1.1] tracking-[-0.015em]">
                  <span style={vars({ '--i': i })}>{line}</span>
                </li>
              ))}
              <li className="mask-line py-4 font-display text-[clamp(1.5rem,4.6vw,2.6rem)] italic leading-[1.1] tracking-[-0.015em] text-[#f3b6c5]">
                <span style={vars({ '--i': AUDIENCES.length })}>Y para tu equipo, en cada cumpleaños.</span>
              </li>
            </ul>
            <div className="mt-10 grid gap-6 border-t border-white/10 pt-8 md:grid-cols-[1fr_auto] md:items-end">
              <p className="max-w-2xl text-[1rem] text-pretty text-[#e8d8c6]">
                Para empresas, bajo petición: nos pasáis la lista del equipo una vez y cada tarta se pide sola una semana antes de su
                cumpleaños, con su frase y su tarjeta. Nadie tiene que acordarse.
              </p>
              {contact || contactEmail ? (
                <a href={(contact ?? contactEmail)!} className="pressable inline-flex h-12 w-fit items-center rounded-pill bg-surface px-6 font-semibold text-ink">
                  Escríbenos
                </a>
              ) : null}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Where + FAQ */}
        <section id="preguntas" aria-labelledby="faq" className="scroll-mt-20 py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[20rem_1fr] md:gap-16">
            <div data-reveal="rise">
              <h2 id="faq" className="type-display">
                Preguntas
              </h2>
              {cities.length > 0 ? (
                <p className="type-body mt-5 text-pretty text-ink-muted">
                  {cities.map((c) => (
                    <span key={c.city} className="block">
                      Repartimos en <strong className="font-semibold text-ink">{c.city}</strong>: códigos postales{' '}
                      {formatPostcodes(c.postalCodes).replace(/, ([^,]*)$/, ' y $1')}.
                    </span>
                  ))}
                  <Link href="/zonas" className="mt-2 inline-block font-medium text-brand underline underline-offset-2">
                    Dónde entregamos
                  </Link>
                </p>
              ) : null}
            </div>
            <div className="border-t border-line">
              {faq.map((item) => (
                <details key={item.q} className="group border-b border-line py-5">
                  <summary className="flex items-baseline justify-between gap-6">
                    <span className="font-display text-[1.2rem] leading-snug">{item.q}</span>
                    <span aria-hidden className="faq-plus shrink-0 text-[1.4rem] font-light leading-none text-ink-muted">
                      +
                    </span>
                  </summary>
                  <p className="type-body mt-3 max-w-2xl text-pretty text-ink-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- Close */}
        <section className="border-t border-line bg-surface-sunken/60">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-[1fr_16rem] md:py-20">
            <div data-reveal="rise">
              <h2 className="type-display text-balance">¿A quién se la mandas?</h2>
              <p className="type-lead mt-3 max-w-lg text-pretty">Dinos a quién, diséñala y paga. Lo demás lo hacemos nosotros.</p>
              <ButtonLink href="/enviar" size="lg" className="mt-8">
                Enviar una tarta
              </ButtonLink>
            </div>
            <div data-reveal="rise" className="mx-auto w-[13rem] rotate-[4deg] md:w-full" style={vars({ '--d': 150 })}>
              <CardPreview design="color" to="Marta" message="¿Hablamos el jueves?" signOff="Pablo" className="shadow-[var(--shadow-lift)]" label="Ejemplo de tarjeta" />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <RevealOnScroll />
    </>
  );
}
