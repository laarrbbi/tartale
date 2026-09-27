import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CardPreview } from '@/components/card/card-preview';
import { DeleteOrderForm, EraseOrderForm, ManualPaymentForm, RefundForm, StatusControls, UpdateOrderForm } from '@/components/admin/order-forms';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { CARD_DESIGNS } from '@/lib/cards';
import { RETENTION_DAYS } from '@/lib/constants';
import { env } from '@/lib/env';
import { longDate } from '@/lib/dates';
import { actorLabel, formatBytes, formatStamp, formatWhen } from '@/lib/format';
import { bakeryBrief, mapsLink, senderConfirmation } from '@/lib/messages';
import { OCCASIONS, ORDER_SOURCES, PAYMENT_METHODS, PAYMENT_STATUSES, SIZES, SLOTS, STATUSES, canDeleteOrder, formatEuros } from '@/lib/orders';
import { telHref, whatsappLink } from '@/lib/whatsapp';
import { requireSession } from '@/server/auth/guard';
import { listAudit } from '@/server/repositories/audit';
import { findBakery, listBakeries } from '@/server/repositories/catalog';
import { findOrderById, getOrderDocumentInfo } from '@/server/repositories/orders';
import { trackingUrl } from '@/server/services/payment-service';

const link = 'type-caption font-medium text-brand underline underline-offset-2';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const isOwner = session.user.role === 'owner';
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const order = await findOrderById(id);
  if (!order) notFound();

  const [bakery, bakeries, activity, document] = await Promise.all([
    findBakery(order.bakeryId),
    listBakeries(),
    listAudit({ target: `order:${order.id}`, limit: 50 }),
    order.hasDocument ? getOrderDocumentInfo(order.id) : Promise.resolve(null),
  ]);
  const tracking = trackingUrl(order.publicId);
  const awaitingPayment = order.paymentMethod === 'stripe' && (order.paymentStatus === 'pendiente' || order.paymentStatus === 'caducado');
  const refundable = order.paymentMethod === 'stripe' ? order.paidCents - order.refundedCents : 0;
  const waSender = whatsappLink(order.senderPhone, senderConfirmation(order, tracking));
  const waBakery = bakery ? whatsappLink(bakery.whatsapp, bakeryBrief(order)) : null;
  const maps = mapsLink(order);
  const recipientTel = telHref(order.recipientPhone);
  const stripeTest = env.STRIPE_SECRET_KEY.startsWith('sk_test_') || env.STRIPE_SECRET_KEY.startsWith('rk_test_');
  const stripeLink = order.stripePaymentIntent
    ? `https://dashboard.stripe.com/${stripeTest ? 'test/' : ''}payments/${order.stripePaymentIntent}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin" className="type-caption font-medium text-ink-muted hover:text-ink">
          ← Pedidos
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="type-display mr-1">
            {order.recipientName ?? 'Datos borrados'}
          </h1>
          <Badge tone={STATUSES[order.status].tone}>{STATUSES[order.status].label}</Badge>
          <Badge tone={PAYMENT_STATUSES[order.paymentStatus].tone}>{PAYMENT_STATUSES[order.paymentStatus].label}</Badge>
        </div>
        <p className="type-body mt-1 text-ink-muted first-letter:uppercase">
          {longDate(order.deliverOn)} · {SLOTS[order.timeSlot].label.toLowerCase()} ({SLOTS[order.timeSlot].hours})
        </p>
        <p className="type-caption mt-1">
          Pedido nº {order.id} · {OCCASIONS[order.occasion].label} · {ORDER_SOURCES[order.source]} · {formatWhen(order.createdAt)}
          {bakery ? ` · ${bakery.name}` : ''}
        </p>
      </div>

      {order.erased ? (
        <p className="type-body rounded-field bg-surface-sunken px-4 py-3">
          Los datos personales de este pedido se borraron. Queda la tarta, el día y el importe, para la contabilidad.
        </p>
      ) : awaitingPayment ? (
        <p className="type-body rounded-field bg-caution-soft px-4 py-3 text-caution">
          Todavía no está pagado: no se prepara hasta que se pague. Si nadie lo paga, se borra solo a los {RETENTION_DAYS.unpaidOrders} días.
        </p>
      ) : (
        <StatusControls
          id={order.id}
          status={order.status}
          isOwner={isOwner}
          refundable={refundable}
          awaitingPayment={awaitingPayment}
          csrfToken={session.csrfToken}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Lo que va en la caja" description="La tarta, sin nada escrito encima; la tarjeta y, si lo hay, el documento, impresos." />
          <CardBody className="flex flex-col gap-3 pt-2">
            <p className="type-body">
              Tarta {order.cakeName} · {SIZES[order.size].label.toLowerCase()}
            </p>
            {order.allergies ? <p className="type-body font-medium text-critical">Alergias: {order.allergies}</p> : null}
            <CardPreview
              design={order.cardDesign}
              message={order.cardMessage ?? ''}
              signOff={order.signOff}
              to={order.recipientName}
              placeholder="(sin mensaje)"
              className="max-w-[13rem] shadow-[var(--shadow-card)]"
            />
            <p className="type-caption">
              Tarjeta {CARD_DESIGNS[order.cardDesign].label.toLowerCase()} · {order.signOff ? `firmada: ${order.signOff}` : 'anónima'}
            </p>
            {!order.erased ? (
              <Link href={`/admin/tarjeta/${order.id}`} target="_blank" className={link}>
                Imprimir la tarjeta (A6)
              </Link>
            ) : null}
            {document ? (
              <a href={`/api/admin/pedidos/${order.id}/documento`} className={link}>
                Descargar el documento para imprimir: {document.filename} ({formatBytes(document.sizeBytes)})
              </a>
            ) : (
              <p className="type-caption">Sin documento.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Entrega" />
          <CardBody className="type-body flex flex-col gap-2 pt-2">
            <p>
              {order.recipientName ?? '—'}
              {order.recipientCompany ? ` · ${order.recipientCompany}` : ''}
            </p>
            <p className="text-ink-muted">
              {order.addressKind === 'oficina' ? '🏢' : '🏠'} {order.address ?? '—'}, {order.postalCode} {order.city}
            </p>
            {order.deliveryNotes ? <p className="text-ink-muted">{order.deliveryNotes}</p> : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {maps ? (
                <a href={maps} target="_blank" rel="noopener noreferrer" className={link}>
                  Abrir en Maps
                </a>
              ) : null}
              {recipientTel ? (
                <a href={recipientTel} className={link} title="Solo para la entrega">
                  Llamar en la entrega ({order.recipientPhone})
                </a>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quién la envía" />
          <CardBody className="type-body flex flex-col gap-1.5 pt-2">
            <p>
              {order.senderName ?? '—'}
              {order.senderCompany ? ` · ${order.senderCompany}` : ''}
            </p>
            {order.senderPhone ? <p className="text-ink-muted">{order.senderPhone}</p> : null}
            {order.senderEmail ? (
              <a href={`mailto:${order.senderEmail}`} className="text-brand underline underline-offset-2">
                {order.senderEmail}
              </a>
            ) : null}
            {waSender && !order.erased ? (
              <a
                href={waSender}
                target="_blank"
                rel="noopener noreferrer"
                className="pressable mt-3 inline-flex h-11 items-center justify-center rounded-pill bg-[#25D366] px-5 font-semibold text-white"
              >
                Confirmar por WhatsApp
              </a>
            ) : null}
            <p className="type-caption mt-2">
              Enlace de seguimiento:{' '}
              <a href={tracking} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
                {tracking}
              </a>
            </p>
            <p className="type-caption">A quien la recibe no se le escribe nunca.</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pago" description={PAYMENT_METHODS[order.paymentMethod]} />
          <CardBody className="type-body flex flex-col gap-1.5 pt-2">
            <p className="flex justify-between">
              <span>Tarta</span>
              <span className="type-numeric">{formatEuros(order.priceCents)}</span>
            </p>
            <p className="flex justify-between">
              <span>Entrega</span>
              <span className="type-numeric">{formatEuros(order.deliveryCents)}</span>
            </p>
            <p className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="type-numeric">{formatEuros(order.totalCents)}</span>
            </p>
            <p className="flex justify-between text-ink-muted">
              <span>Cobrado{order.paidAt ? ` (${formatStamp(order.paidAt)})` : ''}</span>
              <span className="type-numeric">{formatEuros(order.paidCents)}</span>
            </p>
            {order.refundedCents > 0 ? (
              <p className="flex justify-between text-ink-muted">
                <span>Devuelto</span>
                <span className="type-numeric">−{formatEuros(order.refundedCents)}</span>
              </p>
            ) : null}
            {stripeLink && isOwner ? (
              <a href={stripeLink} target="_blank" rel="noopener noreferrer" className={link}>
                Ver el pago en Stripe
              </a>
            ) : null}
            {isOwner && refundable > 0 ? (
              <details className="mt-2">
                <summary className="type-body font-medium">Devolver dinero…</summary>
                <div className="mt-3">
                  <RefundForm id={order.id} refundable={refundable} csrfToken={session.csrfToken} />
                </div>
              </details>
            ) : null}
            {isOwner && order.paymentMethod === 'transferencia' && !order.erased ? (
              <div className="mt-2">
                <ManualPaymentForm id={order.id} paid={order.paymentStatus === 'pagado'} csrfToken={session.csrfToken} />
              </div>
            ) : null}
          </CardBody>
        </Card>

        {bakery ? (
          <Card>
            <CardHeader title="Pastelería" description={bakery.name} />
            <CardBody className="type-body flex flex-col gap-2 pt-2">
              {bakery.contactName ? <p>{bakery.contactName}</p> : null}
              {bakery.phone ? <p className="text-ink-muted">{bakery.phone}</p> : null}
              {waBakery && !order.erased && !awaitingPayment ? (
                <a
                  href={waBakery}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pressable mt-1 inline-flex h-11 items-center justify-center rounded-pill bg-surface px-5 font-semibold text-ink ring-1 ring-line-strong"
                >
                  Pasar el pedido a la pastelería
                </a>
              ) : null}
              <Link href={`/admin/pastelerias/${bakery.id}`} className={link}>
                Ver la pastelería
              </Link>
            </CardBody>
          </Card>
        ) : null}

        {!order.erased ? (
          <Card>
            <CardHeader title="Cambiar" description="Día, franja y una nota para el equipo." />
            <CardBody className="pt-2">
              <UpdateOrderForm
                id={order.id}
                deliverOn={order.deliverOn}
                timeSlot={order.timeSlot}
                staffNote={order.staffNote}
                deliveryCents={order.deliveryCents}
                bakeryId={order.bakeryId}
                bakeries={bakeries.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name }))}
                isOwner={isOwner}
                csrfToken={session.csrfToken}
              />
            </CardBody>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader title="Historial" />
        <CardBody className="pt-2">
          {activity.length === 0 ? (
            <p className="type-caption">Sin cambios todavía.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {activity.map((a) => (
                <li key={a.id} className="type-caption">
                  <span className="text-ink">{formatStamp(a.createdAt)}</span> · {actorLabel(a.actorEmail)} · {a.detail ?? a.action}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {isOwner && canDeleteOrder(order) ? (
        <Card>
          <CardHeader
            title="Borrar el pedido"
            description="Cancelado y sin ningún cobro: si era una prueba o un error, puede desaparecer del todo (queda anotado en Actividad)."
          />
          <CardBody className="pt-2">
            <DeleteOrderForm id={order.id} csrfToken={session.csrfToken} />
          </CardBody>
        </Card>
      ) : null}

      {isOwner && !order.erased ? (
        <Card>
          <CardHeader
            title="Borrar los datos personales"
            description={`Se borran solos ${RETENTION_DAYS.orders} días después de la entrega. Si alguien lo pide antes, bórralos aquí: queda la tarta, el día y el importe.`}
          />
          <CardBody className="pt-2">
            <EraseOrderForm id={order.id} csrfToken={session.csrfToken} />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
