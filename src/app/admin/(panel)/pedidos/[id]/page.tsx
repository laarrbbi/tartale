import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BoxPreview } from '@/components/order/box-preview';
import { IssueOrderInvoiceForm } from '@/components/admin/invoice-forms';
import { DeleteOrderForm, EraseOrderForm, ManualPaymentForm, RefundForm, StatusControls, UpdateOrderForm } from '@/components/admin/order-forms';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { CARD_DESIGNS } from '@/lib/cards';
import { RETENTION_DAYS } from '@/lib/constants';
import { env } from '@/lib/env';
import { longDate } from '@/lib/dates';
import { INVOICE_SERIES } from '@/lib/invoices';
import { actorLabel, formatBytes, formatStamp, formatWhen } from '@/lib/format';
import { bakeryBrief, mapsLink, senderConfirmation } from '@/lib/messages';
import { OCCASIONS, ORDER_SOURCES, PAYMENT_METHODS, PAYMENT_STATUSES, SIZES, SLOTS, STATUSES, canDeleteOrder, formatEuros } from '@/lib/orders';
import { telHref, whatsappLink } from '@/lib/whatsapp';
import { requireSession } from '@/server/auth/guard';
import { listAudit } from '@/server/repositories/audit';
import { findBakery, listBakeries } from '@/server/repositories/catalog';
import { findOrderById, getOrderDocumentInfo } from '@/server/repositories/orders';
import { businessDetails, invoicingGaps, orderInvoicing, type OrderInvoicing } from '@/server/services/invoice-service';
import { trackingUrl } from '@/server/services/payment-service';

const link = 'type-caption font-medium text-brand underline underline-offset-2';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const isOwner = session.user.role === 'owner';
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const order = await findOrderById(id);
  if (!order) notFound();

  const [bakery, bakeries, activity, document, invoicing, business] = await Promise.all([
    findBakery(order.bakeryId),
    listBakeries(),
    listAudit({ target: `order:${order.id}`, limit: 50 }),
    order.hasDocument ? getOrderDocumentInfo(order.id) : Promise.resolve(null),
    // Invoices are the owner's; before the database update that adds them, the card is left out.
    isOwner ? orderInvoicing(order.id).catch((): OrderInvoicing | null => null) : Promise.resolve(null),
    businessDetails(),
  ]);
  const invoiceGaps = invoicingGaps(business);
  const tracking = trackingUrl(order.publicId);
  const photoUrl = `/api/pedidos/${order.publicId}/foto`;
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
          <CardHeader title="La tarta y la caja" description="Encima, la foto y la frase impresas; en la caja, la tarjeta y, si lo hay, el documento." />
          <CardBody className="flex flex-col gap-3 pt-2">
            <BoxPreview
              photo={order.hasPhoto ? photoUrl : null}
              cakeText={order.cakeText}
              cardDesign={order.cardDesign}
              cardMessage={order.cardMessage ?? ''}
              signOff={order.signOff}
              to={order.recipientName}
              documentName={document?.filename ?? null}
              cardPlaceholder="(sin mensaje)"
              cakePlaceholder="Sin foto ni frase"
              className="max-w-[17rem]"
            />
            <p className="type-body">
              Tarta {order.cakeName} · {SIZES[order.size].label.toLowerCase()}
            </p>
            <p className="type-body">
              <span className="text-ink-muted">Encima: </span>
              <strong>{order.cakeText ? `«${order.cakeText}»` : '(sin frase)'}</strong>
              {order.hasPhoto ? ' · con foto' : ' · sin foto'}
            </p>
            {order.hasPhoto && !order.erased ? (
              <a href={`${photoUrl}?descargar`} className={link}>
                Descargar la foto para la impresora
              </a>
            ) : null}
            {order.allergies ? <p className="type-body font-medium text-critical">Alergias: {order.allergies}</p> : null}
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

        {invoicing ? (
          <Card>
            <CardHeader title="Factura" description={invoicing.billing ? 'El cliente pidió factura a nombre de su empresa.' : undefined} />
            <CardBody className="type-body flex flex-col gap-2 pt-2">
              {invoicing.invoices.map((doc) => (
                <p key={doc.id} className="flex items-baseline justify-between gap-3">
                  <Link href={`/admin/facturas/${doc.id}`} className="font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                    {doc.number}
                  </Link>
                  <span className="type-caption min-w-0 flex-1 truncate">
                    {INVOICE_SERIES[doc.series].label}
                    {doc.id === invoicing.current?.id ? ' · vigente' : ''}
                  </span>
                  <span className="type-numeric">{formatEuros(doc.totalCents)}</span>
                </p>
              ))}
              {invoicing.billing ? (
                <p className="type-caption">
                  {invoicing.billing.name} · NIF {invoicing.billing.taxId} · {invoicing.billing.address}, {invoicing.billing.postalCode}{' '}
                  {invoicing.billing.city}
                </p>
              ) : null}
              {!invoicing.current && invoicing.invoiceableCents > 0 ? (
                invoiceGaps.length === 0 ? (
                  <>
                    {order.companyId ? (
                      <p className="type-caption">
                        Los pedidos de una empresa se pueden juntar en una factura desde{' '}
                        <Link href={`/admin/cumpleanos/${order.companyId}`} className={link}>
                          su página
                        </Link>
                        .
                      </p>
                    ) : null}
                    <IssueOrderInvoiceForm orderId={order.id} csrfToken={session.csrfToken} />
                  </>
                ) : (
                  <p className="type-caption">
                    Sin factura: faltan datos en{' '}
                    <Link href="/admin/ajustes" className={link}>
                      Ajustes
                    </Link>{' '}
                    ({invoiceGaps.join(', ')}).
                  </p>
                )
              ) : null}
              {invoicing.invoices.length === 0 && invoicing.invoiceableCents === 0 ? (
                <p className="type-caption">Nada que facturar todavía.</p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

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

      {isOwner && canDeleteOrder({ ...order, invoiced: (invoicing?.invoices.length ?? 0) > 0 }) ? (
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
