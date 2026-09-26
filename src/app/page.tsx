import Image from 'next/image';
import Link from 'next/link';

import { CakePreview } from '@/components/cake/cake-preview';
import { ChatCompare } from '@/components/landing/chat-compare';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ButtonLink } from '@/components/ui/button';
import { LEGAL } from '@/lib/brand';
import { RETENTION_DAYS } from '@/lib/constants';
import { formatEuros, fromPrice } from '@/lib/orders';
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

const STEPS = [
  {
    title: 'Diseñas la tarta',
    body: 'Sube una foto —un logo, una foto vuestra, un meme— y escribe la frase que irá encima. Ves cómo queda mientras escribes.',
  },
  {
    title: 'Dices a quién y cuándo',
    body: 'Su nombre, su oficina y el día. Eliges mañana o tarde y escribes la tarjeta que la acompaña, firmada o anónima.',
  },
  {
    title: 'La horneamos y se la llevamos',
    body: 'Una pastelería de la ciudad la prepara y la entrega en su oficina. Tú sigues el pedido desde un enlace privado.',
  },
] as const;

const SAMPLES = [
  { photo: '/samples/ronda.svg', text: '¿15 minutos para una demo?', who: 'Para un inversor', card: 'Nos encantaría contarte lo que estamos construyendo.' },
  { photo: '/samples/logo.svg', text: 'Gracias por este año 🙏', who: 'Para un cliente', card: 'Gracias por confiar en nosotros.' },
  { photo: '/samples/meme.svg', text: 'Me encantaría trabajar con vosotros', who: 'Para recruiting', card: 'Una forma dulce de presentarme.' },
  { photo: '/samples/equipo.svg', text: '¡Feliz cumple, Marta! 🎂', who: 'Para el equipo', card: 'De parte de todos, que cumplas muchos más.' },
] as const;

const AUDIENCES = [
  { title: 'Ventas', lead: 'El cliente que no contesta', body: 'Algo que no se queda en la bandeja de entrada y que llega con tu nombre.' },
  { title: 'Fundadores', lead: 'El inversor al que quieres llegar', body: 'Tu logo, una frase con gancho y un motivo para responder.' },
  { title: 'Recruiting', lead: 'Candidatos y reclutadores', body: 'Preséntate —o da la bienvenida— de una forma que se recuerde.' },
  { title: 'Alianzas', lead: 'Tu futuro socio', body: 'Empieza la conversación con algo que se comparte en la oficina.' },
] as const;

export default async function HomePage() {
  const { menus, settings } = await load();
  const cities = citiesOf(menus);
  const cakes = menus.flatMap((m) => m.cakes);
  const cheapest = cakes.map((c) => fromPrice(c.prices)).filter((p): p is number => p !== null);
  const fromCents = cheapest.length ? Math.min(...cheapest) : null;
  const deliveries = [...new Set(cities.flatMap((c) => c.deliveryCents))].sort((a, b) => a - b);
  const cityNames = cities.map((c) => c.city);
  const where = cityNames.length ? cityNames.join(', ') : 'Alicante';
  const contact = whatsappLink(settings.whatsappNumber, 'Hola, queremos tartas para los cumpleaños del equipo');
  const contactEmail = LEGAL.email ? `mailto:${LEGAL.email}?subject=Cumplea%C3%B1os%20del%20equipo` : null;
  const notice =
    settings.minNoticeDays === 0
      ? 'para hoy mismo'
      : settings.minNoticeDays === 1
        ? 'para mañana'
        : `con ${settings.minNoticeDays} días de antelación`;

  const priceLine =
    fromCents !== null && deliveries.length
      ? `Tarta desde ${formatEuros(fromCents)} · entrega ${deliveries.map(formatEuros).join(' o ')}`
      : null;

  return (
    <>
      <SiteHeader />
      <main id="main">
        {/* ---------------------------------------------------------------- Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-brand-soft/70 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-10 md:grid-cols-[1.1fr_1fr] md:pb-24 md:pt-20">
            <div className="rise-in">
              <p className="type-eyebrow">Cold cake · {where}</p>
              <h1 className="type-hero mt-4 text-balance">
                Un email se ignora. <em className="text-brand">Una tarta, no.</em>
              </h1>
              <p className="type-lead mt-5 max-w-xl text-pretty">
                Manda una tarta con tu foto y tu mensaje a la oficina de quien quieras: ese cliente que no contesta, un
                inversor, un reclutador o alguien de tu equipo.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <ButtonLink href="/enviar" size="lg">
                  Enviar una tarta
                </ButtonLink>
                <Link href="#como-funciona" className="type-body px-2 py-2 text-center font-medium text-ink-muted hover:text-ink">
                  Cómo funciona ↓
                </Link>
              </div>
              {priceLine ? <p className="type-caption mt-5">{priceLine} · pago con tarjeta al pedir</p> : null}
            </div>
            <div className="rise-in [animation-delay:120ms]">
              <CakePreview photo="/samples/logo.svg" text="¿Un café esta semana? ☕" className="max-w-[24rem]" label="Ejemplo de tarta con un logo impreso" />
              <p className="type-caption mt-5 text-center">Ejemplo: tu foto impresa encima y tu frase.</p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- Email against cake */}
        <section aria-labelledby="diferencia" className="bg-surface-sunken/60 py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-5">
            <p className="type-eyebrow">La diferencia</p>
            <h2 id="diferencia" className="type-display mt-3 max-w-2xl text-balance">
              Lo que pasa con un email. Y lo que puede pasar con una tarta.
            </h2>
            <div className="mt-10">
              <ChatCompare />
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- How it works */}
        <section id="como-funciona" aria-labelledby="como" className="scroll-mt-20 py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-5">
            <p className="type-eyebrow">Cómo funciona</p>
            <h2 id="como" className="type-display mt-3 text-balance">Tres pasos, desde el móvil.</h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-card bg-surface p-6 ring-1 ring-line/70">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-chocolate font-display text-lg font-semibold text-ink-inverse">
                    {i + 1}
                  </span>
                  <h3 className="type-title mt-5">{step.title}</h3>
                  <p className="type-body mt-2 text-pretty text-ink-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------------- Samples */}
        <section aria-labelledby="ideas" className="bg-vanilla/60 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <p className="type-eyebrow">Ideas</p>
            <h2 id="ideas" className="type-display mt-3 max-w-2xl text-balance">Una foto, una frase y a quién va.</h2>
            <p className="type-lead mt-3 max-w-xl text-pretty">Ejemplos de lo que puedes mandar. Tú pones la foto, la frase y la tarjeta.</p>
            <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {SAMPLES.map((s) => (
                <li key={s.who} className="hoverable flex flex-col gap-3 rounded-card bg-surface p-3 ring-1 ring-line/70 sm:gap-4 sm:p-5">
                  <CakePreview photo={s.photo} text={s.text} className="max-w-[15rem]" label={`Ejemplo: ${s.who.toLowerCase()}`} />
                  <div>
                    <p className="type-heading text-[0.95rem] sm:text-[1.0625rem]">{s.who}</p>
                    <p className="type-caption mt-1 hidden italic sm:block">«{s.card}»</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------- Flavours */}
        {cakes.length > 0 ? (
          <section aria-labelledby="sabores" className="py-16 md:py-24">
            <div className="mx-auto max-w-6xl px-5">
              <p className="type-eyebrow">Los sabores</p>
              <h2 id="sabores" className="type-display mt-3 text-balance">Tartas de verdad, de una pastelería de verdad.</h2>
              <p className="type-lead mt-3 max-w-2xl text-pretty">
                {menus.length === 1
                  ? `En ${menus[0]!.city} las hornea ${menus[0]!.bakery.name}. Precio de la tarta según el tamaño; la entrega se suma aparte.`
                  : 'Las hornea una pastelería de cada ciudad. Precio de la tarta según el tamaño; la entrega se suma aparte.'}
              </p>
              <ul className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
                {cakes.map((cake) => {
                  const from = fromPrice(cake.prices);
                  return (
                    <li key={cake.id} className="overflow-hidden rounded-card bg-surface ring-1 ring-line/70">
                      {cake.photo ? (
                        <Image
                          src={cake.photo}
                          alt={`Tarta ${cake.name}`}
                          width={480}
                          height={480}
                          sizes="(min-width: 768px) 25vw, 50vw"
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="grid aspect-square w-full place-items-center bg-surface-sunken font-display text-3xl text-ink-subtle">🎂</div>
                      )}
                      <div className="p-4">
                        <p className="type-heading text-pretty">{cake.name}</p>
                        {from !== null ? <p className="type-caption mt-1">desde {formatEuros(from)}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ----------------------------------------------------------- Audiences */}
        <section aria-labelledby="para-quien" className="bg-chocolate py-16 text-ink-inverse md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <p className="type-eyebrow text-[#f3b6c5]">Para quién</p>
            <h2 id="para-quien" className="type-display mt-3 max-w-2xl text-balance">Para cuando un email no basta.</h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {AUDIENCES.map((a) => (
                <li key={a.title} className="rounded-card bg-white/[0.06] p-6 ring-1 ring-white/10">
                  <p className="type-eyebrow text-[#f3b6c5]">{a.title}</p>
                  <p className="type-title mt-3 text-ink-inverse">{a.lead}</p>
                  <p className="mt-2 text-[0.9375rem] text-pretty text-[#e8d8c6]">{a.body}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-card bg-white/[0.06] p-6 ring-1 ring-white/10 md:flex md:items-center md:justify-between md:gap-8">
              <div>
                <p className="type-eyebrow text-[#f3b6c5]">Equipos</p>
                <p className="type-title mt-3 text-ink-inverse">Los cumpleaños del equipo, en automático</p>
                <p className="mt-2 max-w-2xl text-[0.9375rem] text-pretty text-[#e8d8c6]">
                  Nos pasas la lista una vez y cada cumpleaños llega su tarta a la oficina, sin que nadie tenga que acordarse.
                  Solo para empresas, bajo petición.
                </p>
              </div>
              {contact || contactEmail ? (
                <a
                  href={(contact ?? contactEmail)!}
                  className="pressable mt-5 inline-flex h-12 shrink-0 items-center rounded-pill bg-surface px-6 font-semibold text-ink md:mt-0"
                >
                  Escríbenos
                </a>
              ) : null}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- Cities */}
        <section aria-labelledby="donde" className="py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-5">
            <p className="type-eyebrow">Dónde</p>
            <h2 id="donde" className="type-display mt-3 text-balance">Dónde entregamos</h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {cities.length > 0 ? (
                cities.map((c) => (
                  <li key={c.city} className="rounded-card bg-surface p-6 ring-1 ring-line/70">
                    <p className="type-title">{c.city}</p>
                    <p className="type-body mt-2 text-ink-muted">Códigos postales {formatPostcodes(c.postalCodes).replace(/, ([^,]*)$/, ' y $1')}.</p>
                    <p className="type-caption mt-2">Entrega: {c.deliveryCents.map(formatEuros).join(' o ')}</p>
                  </li>
                ))
              ) : (
                <li className="rounded-card bg-surface p-6 ring-1 ring-line/70">
                  <p className="type-title">Alicante</p>
                </li>
              )}
              <li className="rounded-card border border-dashed border-line-strong p-6">
                <p className="type-title text-ink-muted">Más ciudades</p>
                <p className="type-body mt-2 text-ink-muted">Pronto, en más ciudades.</p>
              </li>
            </ul>
          </div>
        </section>

        {/* ----------------------------------------------------------------- FAQ */}
        <section id="preguntas" aria-labelledby="faq" className="scroll-mt-20 bg-surface-sunken/60 py-16 md:py-24">
          <div className="mx-auto max-w-3xl px-5">
            <p className="type-eyebrow">Preguntas</p>
            <h2 id="faq" className="type-display mt-3">Lo que suele preguntarse</h2>
            <div className="mt-8 divide-y divide-line rounded-card bg-surface ring-1 ring-line/70">
              {[
                {
                  q: '¿Cuánto cuesta?',
                  a:
                    fromCents !== null && deliveries.length
                      ? `La tarta cuesta desde ${formatEuros(fromCents)}, según el sabor y el tamaño, y la entrega ${deliveries.map(formatEuros).join(' o ')}. Ves el total antes de pagar.`
                      : 'Depende del sabor y del tamaño, más la entrega. Ves el total antes de pagar.',
                },
                {
                  q: '¿Cómo se paga?',
                  a: 'Con tarjeta al hacer el pedido, en la página de pago segura de Stripe. Si no podemos entregarla, te devolvemos el dinero.',
                },
                {
                  q: '¿Con cuánta antelación tengo que pedirla?',
                  a: `Puedes pedirla ${notice}. Eliges el día y si la quieres por la mañana o por la tarde.`,
                },
                {
                  q: '¿Qué foto puedo poner?',
                  a: 'Un logo, una foto o un meme: se imprime encima de la tarta. Sube una imagen JPG o PNG; cuanto más nítida, mejor. La vista previa es orientativa.',
                },
                {
                  q: '¿Qué va escrito?',
                  a: 'Una frase corta encima de la tarta (hasta 60 caracteres) y, aparte, una tarjeta con tu mensaje. Puedes firmarla o mandarla de forma anónima.',
                },
                {
                  q: '¿Y si tiene alguna alergia?',
                  a: 'Indícalo en el pedido. Si la pastelería no puede adaptarla, te lo decimos antes de hornearla y te devolvemos el dinero.',
                },
                {
                  q: '¿Qué hacéis con los datos de quien la recibe?',
                  a: `Solo los usamos para entregarle la tarta. Nunca le escribimos ni le mandamos publicidad, y los borramos ${RETENTION_DAYS.orders} días después de la entrega.`,
                },
                {
                  q: '¿Puedo seguir el pedido?',
                  a: 'Sí. Al pagar tienes un enlace privado donde ves cómo va: recibido, confirmado, en el horno, de camino y entregado.',
                },
                {
                  q: '¿Hacéis cumpleaños para empresas?',
                  a: 'Sí, bajo petición: nos pasas la lista del equipo y cada tarta se prepara sola una semana antes del cumpleaños. Escríbenos.',
                },
              ].map((item) => (
                <details key={item.q} className="group px-5 py-4 sm:px-6">
                  <summary className="flex items-center justify-between gap-4 py-1">
                    <span className="type-heading">{item.q}</span>
                    <span aria-hidden className="faq-plus grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-sunken text-lg leading-none text-ink">
                      +
                    </span>
                  </summary>
                  <p className="type-body mt-2 text-pretty text-ink-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- Final CTA */}
        <section className="py-20 md:py-28">
          <div className="mx-auto flex max-w-3xl flex-col items-center px-5 text-center">
            <h2 className="type-display text-balance">¿A quién le mandas la primera?</h2>
            <p className="type-lead mt-4 max-w-xl text-pretty">Verás cómo queda la tarta mientras la diseñas.</p>
            <ButtonLink href="/enviar" size="lg" className="mt-8">
              Enviar una tarta
            </ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
