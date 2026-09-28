import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BoxPreview } from '@/components/order/box-preview';
import { CompanyInvoiceForm } from '@/components/order/company-invoice-form';
import { CopyLinkButton, PayNowButton } from '@/components/order/tracking-actions';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { RETENTION_DAYS } from '@/lib/constants';
import { longDate } from '@/lib/dates';
import { INVOICE_SERIES } from '@/lib/invoices';
import { SIZES, SLOTS, STATUSES, STATUS_FLOW, formatEuros } from '@/lib/orders';
import { whatsappLink } from '@/lib/whatsapp';
import { isPublicId } from '@/server/http/body';
import { getOrderDocumentInfo } from '@/server/repositories/orders';
import { getSettings } from '@/server/repositories/settings';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { getClientIp } from '@/server/security/request';
import { orderInvoicing, type OrderInvoicing } from '@/server/services/invoice-service';
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
  const [settings, document, invoicing] = await Promise.all([
    getSettings(),
    order.hasDocument ? getOrderDocumentInfo(order.id) : Promise.resolve(null),
    // Invoices are a courtesy on this page: if they cannot be read, the page still shows the order.
    orderInvoicing(order.id).catch((): OrderInvoicing | null => null),
  ]);

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
        ? '¡Entregada!'
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

        <section aria-label="Lo que le llega" className="flex flex-col items-center gap-4">
          <BoxPreview
            photo={order.hasPhoto ? `/api/pedidos/${order.publicId}/foto` : null}
            cakeText={order.cakeText}
            cardDesign={order.cardDesign}
            cardMessage={order.cardMessage ?? ''}
            signOff={order.signOff}
            to={order.recipientName}
            documentName={document?.filename ?? null}
            cardPlaceholder=" "
            cakePlaceholder=""
            className="max-w-[22rem]"
          />
          <p className="type-caption text-center text-pretty">
            {order.hasPhoto && order.cakeText
              ? 'Tu foto y tu frase, impresas encima. '
              : order.hasPhoto
                ? 'Tu foto, impresa encima. '
                : order.cakeText
                  ? 'Tu frase, encima. '
                  : ''}
            La tarjeta va impresa en la caja{document ? `, con tu documento (${document.filename})` : ''}. Un boceto: la
            tarta de verdad la hace la pastelería.
          </p>
        </section>

        <section aria-label="Entrega" className="flex flex-col gap-1.5 rounded-card bg-surface p-6 ring-1 ring-line/70">
          <p className="type-heading">
            {order.recipientName}
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

        {!unpaid && invoicing ? <InvoiceSection order={order} invoicing={invoicing} /> : null}

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

/** F2026-0004 with a hyphen a line never breaks at. */
const unbroken = (number: string) => number.replace('-', '\u2011');

/**
 * The order's invoices, and the way to have one in a company's name: before
 * it is issued, or by swapping the simplificada for a completa.
 */
function InvoiceSection({
  order,
  invoicing,
}: {
  order: { publicId: string; paymentMethod: string };
  invoicing: OrderInvoicing;
}) {
  const { invoices, current, billing } = invoicing;
  const byCard = order.paymentMethod === 'stripe';
  const prompt =
    current?.series === 'S'
      ? '¿La necesitas a nombre de tu empresa?'
      : !current && byCard
        ? billing
          ? 'Cambiar los datos de la factura'
          : '¿La quieres a nombre de tu empresa?'
        : null;

  return (
    <section aria-labelledby="factura" className="flex flex-col gap-3 rounded-card bg-surface p-6 ring-1 ring-line/70">
      <h2 id="factura" className="type-heading">
        Factura
      </h2>
      {invoices.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {invoices.map((doc) => {
            const replacement = invoices.find((other) => other.replacesId === doc.id);
            const rectified = doc.rectifiesId ? invoices.find((other) => other.id === doc.rectifiesId) : null;
            return (
              <li key={doc.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link
                    href={`/factura/${doc.publicId}`}
                    className="type-body whitespace-nowrap font-semibold underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                  >
                    {doc.number}
                  </Link>
                  <p className="type-caption text-pretty">
                    {INVOICE_SERIES[doc.series].label}
                    {replacement ? `, sustituida por la ${unbroken(replacement.number)}` : ''}
                    {rectified ? ` de la ${unbroken(rectified.number)}${doc.reason ? `: ${doc.reason.toLowerCase()}` : ''}` : ''}
                  </p>
                </div>
                <span className="type-body type-numeric whitespace-nowrap">{formatEuros(doc.totalCents)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="type-body text-pretty text-ink-muted">
          {billing ? `Saldrá a nombre de ${billing.name}. ` : ''}La verás aquí en cuanto la emitamos.
        </p>
      )}
      {prompt && byCard ? <CompanyInvoiceForm token={order.publicId} prompt={prompt} /> : null}
      {current?.series === 'F' ? (
        <p className="type-caption text-pretty">Si hay un error en los datos de la factura, escríbenos y te la corregimos.</p>
      ) : null}
    </section>
  );
}
