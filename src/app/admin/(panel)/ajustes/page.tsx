import Link from 'next/link';

import { BusinessForm, DeliveryPricesForm, SchemaUpdatesForm, SettingsForm } from '@/components/admin/settings-forms';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { RETENTION_DAYS } from '@/lib/constants';
import { env } from '@/lib/env';
import { formatVatRate } from '@/lib/invoices';
import { formatEuros } from '@/lib/orders';
import { requireOwner } from '@/server/auth/guard';
import { getDb } from '@/server/db/pg';
import { listBakeries, listZones } from '@/server/repositories/catalog';
import { getSettings } from '@/server/repositories/settings';
import { getTotp } from '@/server/repositories/users';
import { businessDetails, invoicingGaps } from '@/server/services/invoice-service';
import { publicApiIsClosed, schemaStatus } from '@/server/services/schema-updates';

interface CheckItem {
  label: string;
  ok: boolean;
  detail: string;
}

export default async function SettingsPage() {
  const session = await requireOwner();
  const [settings, zones, bakeries, updates, apiClosed, totp, business] = await Promise.all([
    getSettings(),
    listZones(),
    listBakeries(),
    schemaStatus(),
    publicApiIsClosed(getDb()),
    getTotp(session.user.id),
    businessDetails(),
  ]);
  const invoicesReady = updates.find((u) => u.id === '20260928120000_invoices')?.applied ?? false;
  const legalComplete = Boolean(business.legalName && business.taxId && business.address && business.email);
  const invoiceGaps = invoicingGaps(business);
  const bakeryName = new Map(bakeries.map((b) => [b.id, b.name]));
  const pendingUpdates = updates.filter((u) => !u.applied);
  const stripeMode = env.STRIPE_SECRET_KEY.includes('_live_') ? 'real' : env.STRIPE_SECRET_KEY ? 'de prueba' : null;

  const checklist: CheckItem[] = [
    {
      label: 'Cobro con tarjeta (Stripe)',
      ok: stripeMode !== null,
      detail:
        stripeMode === 'real'
          ? 'Conectado en modo real.'
          : stripeMode
            ? 'Conectado en modo de prueba: nadie paga de verdad. Para abrir, pon la clave real (sk_live_…).'
            : 'Falta STRIPE_SECRET_KEY en Vercel. Sin ella, la web no acepta pedidos.',
    },
    {
      label: 'Avisos de pago de Stripe (webhook)',
      ok: env.STRIPE_WEBHOOK_SECRET.length > 0,
      detail: env.STRIPE_WEBHOOK_SECRET
        ? 'Configurado.'
        : 'Falta STRIPE_WEBHOOK_SECRET: los pedidos se marcan pagados al volver de Stripe, pero si alguien cierra la pestaña a mitad no nos enteramos.',
    },
    {
      label: 'Datos legales de la empresa',
      ok: legalComplete,
      detail: legalComplete
        ? 'Completos en el aviso legal y la política de privacidad.'
        : 'Faltan razón social, NIF, dirección o email (aquí abajo). La ley los pide en la web antes de vender.',
    },
    {
      label: 'Facturas',
      ok: invoiceGaps.length === 0,
      detail:
        invoiceGaps.length === 0
          ? `Cada pedido pagado con tarjeta recibe su factura al momento. IVA: ${formatVatRate(business.vatRateBp!)}.`
          : `Sin ${invoiceGaps.join(', ')} no se emite ninguna: los pedidos pagados esperan en Facturas.`,
    },
    {
      label: 'Tareas de cada noche',
      ok: env.CRON_SECRET.length > 0,
      detail: env.CRON_SECRET
        ? `Activas: borrado de datos personales a los ${RETENTION_DAYS.orders} días de la entrega y pedidos de cumpleaños.`
        : `Falta CRON_SECRET en Vercel: sin ella no se borran los datos a los ${RETENTION_DAYS.orders} días ni se crean los cumpleaños.`,
    },
    {
      label: 'Acceso público de Supabase cerrado',
      ok: apiClosed,
      detail: apiClosed
        ? 'Todas las tablas con RLS y sin permisos para la API pública.'
        : 'Hay alguna tabla abierta a la API pública de Supabase. Pulsa «Actualizar la base de datos».',
    },
    {
      label: 'WhatsApp de Tartame',
      ok: Boolean(settings.whatsappNumber),
      detail: settings.whatsappNumber ? settings.whatsappNumber : 'Sin número: el seguimiento no ofrece escribirnos por WhatsApp.',
    },
    {
      label: 'Tu verificación en dos pasos',
      ok: Boolean(totp?.enabled),
      detail: totp?.enabled ? 'Activada.' : 'Desactivada. Actívala en Cuenta: esta cuenta puede devolver dinero.',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">Ajustes</h1>
        <p className="type-body mt-1 text-ink-muted">Cuándo se puede pedir, cuánto cuesta la entrega y lo que falta para abrir.</p>
      </div>

      <Card>
        <CardHeader title="Puesta a punto" description="Lo que tiene que estar en verde antes de vender de verdad." />
        <CardBody className="pt-2">
          <ul className="flex flex-col divide-y divide-line">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-start gap-3 py-3">
                <span aria-hidden className={item.ok ? 'text-positive' : 'text-caution'}>
                  {item.ok ? '●' : '○'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="type-body font-medium">{item.label}</p>
                  <p className="type-caption text-pretty">{item.detail}</p>
                </div>
                <Badge tone={item.ok ? 'positive' : 'caution'}>{item.ok ? 'Listo' : 'Pendiente'}</Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Datos de la empresa y facturas"
          description="Salen en el aviso legal, en la política de privacidad y en cada factura. Las facturas ya emitidas no cambian."
        />
        <CardBody className="pt-2">
          {invoicesReady ? (
            <BusinessForm business={business} csrfToken={session.csrfToken} />
          ) : (
            <p className="type-caption rounded-field bg-caution-soft px-4 py-3 text-caution">
              Primero pulsa «Actualizar la base de datos» (abajo del todo): esta versión la necesita para guardar estos datos.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Pedidos" description="Afecta al formulario de la web al momento. Los pedidos ya hechos no cambian." />
        <CardBody className="pt-2">
          <SettingsForm
            settings={{
              ordersEnabled: settings.ordersEnabled,
              minNoticeDays: settings.minNoticeDays,
              maxDaysAhead: settings.maxDaysAhead,
              closedWeekdays: settings.closedWeekdays,
              whatsappNumber: settings.whatsappNumber,
            }}
            csrfToken={session.csrfToken}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Precio de la entrega"
          description={
            <>
              Por zona de reparto. Los códigos postales de cada zona se cambian en{' '}
              <Link href="/admin/pastelerias" className="underline underline-offset-2">
                Pastelerías
              </Link>
              .
            </>
          }
        />
        <CardBody className="pt-2">
          {zones.length === 0 ? (
            <p className="type-caption">No hay zonas todavía.</p>
          ) : (
            <DeliveryPricesForm
              zones={zones.map((z) => ({
                id: z.id,
                label: `${z.name} · ${bakeryName.get(z.bakeryId) ?? ''}${z.active ? '' : ' (pausada)'}`,
                deliveryCents: z.deliveryCents,
              }))}
              csrfToken={session.csrfToken}
            />
          )}
          <p className="type-caption mt-3">
            Ahora: {zones.filter((z) => z.active).map((z) => `${z.name} ${formatEuros(z.deliveryCents)}`).join(' · ') || '—'}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Base de datos"
          description="Cuando una versión nueva de la web necesita un cambio en la base de datos, aparece aquí. Nunca se aplica solo."
        />
        <CardBody className="flex flex-col gap-3 pt-2">
          <ul className="flex flex-col gap-1.5">
            {updates.map((u) => (
              <li key={u.id} className="type-caption flex items-center gap-2">
                <Badge tone={u.applied ? 'positive' : 'caution'}>{u.applied ? 'Aplicada' : 'Pendiente'}</Badge>
                <span className="text-ink">{u.label}</span>
              </li>
            ))}
          </ul>
          <SchemaUpdatesForm pending={pendingUpdates.length > 0} csrfToken={session.csrfToken} />
        </CardBody>
      </Card>
    </div>
  );
}
