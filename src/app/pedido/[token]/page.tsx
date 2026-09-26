import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CakePreview } from '@/components/cake/cake-preview';
import { CopyLinkButton, PayNowButton } from '@/components/order/tracking-actions';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { RETENTION_DAYS } from '@/lib/constants';
import { longDate } from '@/lib/dates';
import { OCCASIONS, SIZES, SLOTS, STATUSES, STATUS_FLOW, formatEuros } from '@/lib/orders';
import { whatsappLink } from '@/lib/whatsapp';
import { isPublicId } from '@/server/http/body';
import { getSettings } from '@/server/repositories/settings';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { getClientIp } from '@/server/security/request';
import { orderForTracking } from '@/server/services/order-service';

export const metadata: Metadata = {
  title: 'Tu pedido',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

/**
 * The sender's page for one order. The link is the key: 22 random
 * characters, never indexed, never sent on as a referrer. After Stripe it
 * confirms the payment itself (the webhook may not have arrived yet).
 */
export default async function TrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  if (!isPublicId(token)) notFound();
  if (!(await consume(RULES.tracking, hashIp(await getClientIp()) ?? ANONYMOUS_BUCKET)).allowed) {
    return (
      <main id="main" className="mx-auto max-w-md px-5 py-24 text-center">
        <p className="type-title">Demasiadas visitas seguidas</p>
        <p className="type-body mt-2 text-ink-muted">Vuelve a abrir el enlace en unos minutos.</p>
      </main>
    );
  }

  const sessionId = typeof query.session_id === 'string' ? query.session_id : null;
  const order = await orderForTracking(token, sessionId);
  if (!order) notFound();
  const settings = await getSettings();

  const unpaid = order.paymentMethod === 'stripe' && (order.paymentStatus === 'pendiente' || order.paymentStatus === 'caducado');
  const cancelled = order.status === 'cancelado';
  const current = STATUS_FLOW.indexOf(order.status);
  const came = typeof query.pago === 'string' ? query.pago : null;
  const wa = whatsappLink(settings.whatsappNumber, `Hola, sobre mi pedido nº ${order.id} (tarta para ${order.recipientName ?? ''})`);

  const title = cancelled
    ? 'Pedido cancelado'
    : unpaid
      ? 'Falta el pago'
      : order.status === 'entregado'
        ? '¡Entregada! 🎉'
        : `Tu tarta para ${order.recipientName}`;

  const lead = cancelled
    ? order.refundedCents > 0
      ? `Te hemos devuelto ${formatEuros(order.refundedCents)} a la tarjeta con la que pagaste. Puede tardar unos días en aparecer.`
      : 'Si no esperabas esto, escríbenos.'
    : unpaid
      ? came === 'cancelado'
        ? 'No has completado el pago. Cuando quieras, puedes pagar desde aquí: la tarta no se prepara hasta entonces.'
        : came === 'ok'
          ? 'Estamos confirmando tu pago con el banco. Actualiza la página en unos segundos.'
          : 'La tarta no se prepara hasta que el pedido esté pagado.'
      : order.status === 'nuevo'
        ? 'Lo hemos recibido y está pagado. Lo revisamos y te avisamos cuando lo confirmemos. Guarda este enlace para ver cómo va.'
        : `${longDate(order.deliverOn)}, ${SLOTS[order.timeSlot].label.toLowerCase()} (${SLOTS[order.timeSlot].hours}).`;

  return (
    <>
      <SiteHeader cta={false} />
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-7 px-5 pb-20 pt-8 md:pt-12">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <p className="type-eyebrow">Pedido nº {order.id}</p>
            {order.paymentStatus === 'pagado' ? <Badge tone="positive">Pagado</Badge> : null}
            {order.paymentStatus === 'parcial' ? <Badge tone="caution">Devuelto en parte</Badge> : null}
            {order.paymentStatus === 'reembolsado' ? <Badge>Devuelto</Badge> : null}
          </div>
          <h1 className="type-display mt-3 text-balance">{title}</h1>
          <p className="type-lead mt-3 text-pretty">{lead}</p>
        </header>

        {unpaid && !cancelled ? (
          <PayNowButton token={order.publicId} label={`Pagar ${formatEuros(order.totalCents)}`} />
        ) : null}

        {!unpaid && !cancelled ? (
          <ol className="grid grid-cols-5 gap-1.5" aria-label="Estado del pedido">
            {STATUS_FLOW.map((status, i) => (
              <li key={status} className="flex flex-col gap-1.5" aria-current={i === current ? 'step' : undefined}>
                <span className={cn('h-1.5 rounded-pill', i <= current ? 'bg-brand' : 'bg-line')} />
                <span className={cn('text-[0.7rem] leading-tight sm:text-[0.8rem]', i === current ? 'font-semibold text-ink' : 'text-ink-muted')}>
                  {STATUSES[status].customer}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        <CakePreview
          photo={order.hasPhoto ? `/api/pedidos/${order.publicId}/foto` : null}
          text={order.cakeText}
          className="max-w-[18rem]"
        />

        <section aria-label="La tarjeta" className="rounded-card bg-[#fffaf1] p-6 ring-1 ring-line">
          <p className="type-eyebrow text-ink-subtle">La tarjeta</p>
          <p className="mt-3 whitespace-pre-line font-display text-[1.15rem] leading-snug text-pretty">{order.cardMessage || '—'}</p>
          <p className="type-caption mt-3 text-right">{order.signOff ? `— ${order.signOff}` : '(anónima)'}</p>
        </section>

        <section aria-label="Entrega" className="flex flex-col gap-1.5 rounded-card bg-surface p-6 ring-1 ring-line/70">
          <p className="type-heading">
            {OCCASIONS[order.occasion].emoji} {order.recipientName}
            {order.recipientCompany ? ` · ${order.recipientCompany}` : ''}
          </p>
          <p className="type-body text-ink-muted">
            {order.addressKind === 'oficina' ? 'Oficina' : 'Casa'}: {order.address}, {order.postalCode} {order.city}
            {order.deliveryNotes ? ` · ${order.deliveryNotes}` : ''}
          </p>
          <p className="type-body text-ink-muted">
            {longDate(order.deliverOn)} · {SLOTS[order.timeSlot].hours}
          </p>
          {order.allergies ? <p className="type-body text-ink-muted">Alergias: {order.allergies}</p> : null}

          <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
            <p className="type-body flex justify-between gap-3">
              <span>
                Tarta {order.cakeName} · {SIZES[order.size].label.toLowerCase()}
              </span>
              <span className="type-numeric">{formatEuros(order.priceCents)}</span>
            </p>
            <p className="type-body flex justify-between gap-3">
              <span>Entrega</span>
              <span className="type-numeric">{order.deliveryCents === 0 ? 'Gratis' : formatEuros(order.deliveryCents)}</span>
            </p>
            <p className="type-body flex justify-between gap-3 font-semibold">
              <span>Total</span>
              <span className="type-numeric">{formatEuros(order.totalCents)}</span>
            </p>
            {order.refundedCents > 0 ? (
              <p className="type-caption flex justify-between gap-3">
                <span>Devuelto</span>
                <span className="type-numeric">−{formatEuros(order.refundedCents)}</span>
              </p>
            ) : null}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <CopyLinkButton />
          {wa ? (
            <a href={wa} rel="noopener noreferrer" className="pressable type-caption rounded-pill bg-[#25D366] px-3.5 py-1.5 font-semibold text-white">
              ¿Algún cambio? WhatsApp
            </a>
          ) : null}
        </div>
        <p className="type-caption text-center text-pretty">
          Este enlace es privado: quien lo tenga puede ver el pedido. Los datos de la entrega se borran {RETENTION_DAYS.orders} días después.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
