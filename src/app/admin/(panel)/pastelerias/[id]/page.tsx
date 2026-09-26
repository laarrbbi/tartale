import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BakeryDetailsForm, CakeForm, ZoneForm } from '@/components/admin/bakery-forms';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { madridToday, relativeDayLabel } from '@/lib/dates';
import { actorLabel, formatStamp } from '@/lib/format';
import { SIZES, SIZE_IDS, SLOTS, STATUSES, formatEuros } from '@/lib/orders';
import { telHref, whatsappLink } from '@/lib/whatsapp';
import { formatPostcodes } from '@/lib/zones';
import { requireSession } from '@/server/auth/guard';
import { listAudit } from '@/server/repositories/audit';
import { findBakery, listCakes, listZones } from '@/server/repositories/catalog';
import { listOrders } from '@/server/repositories/orders';

const link = 'type-caption font-medium text-brand underline underline-offset-2';

export default async function BakeryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const isOwner = session.user.role === 'owner';
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const bakery = await findBakery(id);
  if (!bakery) notFound();

  const today = madridToday();
  const [zones, cakes, orders, activity] = await Promise.all([
    listZones({ bakeryId: bakery.id }),
    listCakes({ bakeryId: bakery.id }),
    listOrders({ filter: 'activos', today, bakeryId: bakery.id, limit: 15 }),
    isOwner ? listAudit({ target: `bakery:${bakery.id}`, limit: 30 }) : Promise.resolve([]),
  ]);
  const tel = telHref(bakery.phone);
  const wa = whatsappLink(bakery.whatsapp);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/pastelerias" className="type-caption font-medium text-ink-muted hover:text-ink">
          ← Pastelerías
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="type-display mr-1">{bakery.name}</h1>
          <Badge tone={bakery.active ? 'positive' : 'neutral'}>{bakery.active ? 'Activa' : 'Pausada'}</Badge>
          {bakery.printsPhotos ? <Badge tone="brand">Imprime fotos</Badge> : <Badge>Sin fotos</Badge>}
        </div>
        <p className="type-body mt-1 text-ink-muted">
          {bakery.city}
          {bakery.address ? ` · ${bakery.address}` : ''}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Por entregar"
            action={
              <Link href={`/admin?pasteleria=${bakery.id}`} className={link}>
                Ver todos
              </Link>
            }
          />
          <CardBody className="pt-2">
            {orders.length === 0 ? (
              <p className="type-caption">Nada pendiente.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/pedidos/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand">
                      <span className="min-w-0">
                        <span className="type-body block truncate first-letter:uppercase">
                          {relativeDayLabel(o.deliverOn, today)} · {SLOTS[o.timeSlot].hours}
                        </span>
                        <span className="type-caption block truncate">
                          nº {o.id} · {o.cakeName} {SIZES[o.size].label.toLowerCase()}
                          {o.hasPhoto ? ' · 📸' : ''}
                        </span>
                      </span>
                      <Badge tone={STATUSES[o.status].tone}>{STATUSES[o.status].label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Contacto" />
          <CardBody className="type-body flex flex-col gap-1.5 pt-2">
            {bakery.contactName ? <p>{bakery.contactName}</p> : null}
            {bakery.phone ? (
              tel ? (
                <a href={tel} className="text-brand underline underline-offset-2">
                  {bakery.phone}
                </a>
              ) : (
                <p>{bakery.phone}</p>
              )
            ) : null}
            {bakery.email ? (
              <a href={`mailto:${bakery.email}`} className="text-brand underline underline-offset-2">
                {bakery.email}
              </a>
            ) : null}
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={link}>
                Abrir WhatsApp
              </a>
            ) : null}
            {!bakery.contactName && !bakery.phone && !bakery.email ? <p className="type-caption">Sin datos de contacto todavía.</p> : null}
            {bakery.notes ? <p className="type-caption mt-2 whitespace-pre-line">{bakery.notes}</p> : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Zonas de reparto"
          description="Cada código postal lo reparte una sola zona activa. Un pedido de un código que no está en ninguna no se puede hacer."
        />
        <CardBody className="flex flex-col gap-3 pt-2">
          {zones.length === 0 ? <p className="type-caption">Sin zonas: esta pastelería no recibe pedidos todavía.</p> : null}
          {zones.map((zone) => (
            <div key={zone.id} className="rounded-field bg-surface-sunken/50 px-4 py-3 ring-1 ring-line/60">
              <div className="flex flex-wrap items-center gap-2">
                <p className="type-body font-medium">
                  {zone.name} · {zone.city}
                </p>
                {!zone.active ? <Badge>Pausada</Badge> : null}
                <span className="type-numeric type-body ml-auto">Entrega {formatEuros(zone.deliveryCents)}</span>
              </div>
              <p className="type-caption mt-1 break-words">{formatPostcodes(zone.postalCodes) || 'Sin códigos'}</p>
              {isOwner ? (
                <details className="mt-2">
                  <summary className="type-caption cursor-pointer font-medium text-brand">Editar</summary>
                  <div className="mt-3">
                    <ZoneForm
                      bakeryId={bakery.id}
                      city={bakery.city}
                      zone={{ id: zone.id, name: zone.name, city: zone.city, postalCodes: zone.postalCodes, deliveryCents: zone.deliveryCents, active: zone.active }}
                      csrfToken={session.csrfToken}
                    />
                  </div>
                </details>
              ) : null}
            </div>
          ))}
          {isOwner ? (
            <details className="rounded-field border border-dashed border-line-strong px-4 py-3">
              <summary className="type-body cursor-pointer font-medium">Añadir una zona</summary>
              <div className="mt-3">
                <ZoneForm bakeryId={bakery.id} city={bakery.city} csrfToken={session.csrfToken} />
              </div>
            </details>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Carta"
          description="Los precios que ve el cliente, por tamaño. Cambiar un precio no toca los pedidos ya hechos."
        />
        <CardBody className="flex flex-col gap-3 pt-2">
          {cakes.length === 0 ? <p className="type-caption">La carta está vacía.</p> : null}
          {cakes.map((cake) => (
            <div key={cake.id} className="rounded-field bg-surface-sunken/50 px-4 py-3 ring-1 ring-line/60">
              <div className="flex items-center gap-3">
                {cake.photo ? (
                  <Image src={cake.photo} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-vanilla text-xl">
                    🎂
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="type-body flex flex-wrap items-center gap-2 font-medium">
                    {cake.name} {!cake.active ? <Badge>Oculta</Badge> : null}
                  </p>
                  <p className="type-caption type-numeric">
                    {SIZE_IDS.map((size) => `${SIZES[size].label} ${cake.prices[size] === null ? '—' : formatEuros(cake.prices[size]!)}`).join(' · ')}
                  </p>
                  {cake.description ? <p className="type-caption truncate">{cake.description}</p> : null}
                </div>
              </div>
              {isOwner ? (
                <details className="mt-2">
                  <summary className="type-caption cursor-pointer font-medium text-brand">Editar</summary>
                  <div className="mt-3">
                    <CakeForm
                      bakeryId={bakery.id}
                      cake={{
                        id: cake.id,
                        name: cake.name,
                        description: cake.description,
                        photo: cake.photo,
                        prices: cake.prices,
                        active: cake.active,
                        sortOrder: cake.sortOrder,
                      }}
                      csrfToken={session.csrfToken}
                    />
                  </div>
                </details>
              ) : null}
            </div>
          ))}
          {isOwner ? (
            <details className="rounded-field border border-dashed border-line-strong px-4 py-3">
              <summary className="type-body cursor-pointer font-medium">Añadir una tarta</summary>
              <div className="mt-3">
                <CakeForm bakeryId={bakery.id} csrfToken={session.csrfToken} />
              </div>
            </details>
          ) : null}
        </CardBody>
      </Card>

      {isOwner ? (
        <Card>
          <CardHeader title="Datos de la pastelería" />
          <CardBody className="pt-2">
            <BakeryDetailsForm
              bakery={{
                id: bakery.id,
                name: bakery.name,
                city: bakery.city,
                address: bakery.address,
                contactName: bakery.contactName,
                phone: bakery.phone,
                whatsapp: bakery.whatsapp,
                email: bakery.email,
                printsPhotos: bakery.printsPhotos,
                active: bakery.active,
                sizeNotes: bakery.sizeNotes,
                notes: bakery.notes,
              }}
              csrfToken={session.csrfToken}
            />
          </CardBody>
        </Card>
      ) : null}

      {isOwner && activity.length > 0 ? (
        <Card>
          <CardHeader title="Cambios" />
          <CardBody className="pt-2">
            <ul className="flex flex-col gap-1.5">
              {activity.map((a) => (
                <li key={a.id} className="type-caption">
                  <span className="text-ink">{formatStamp(a.createdAt)}</span> · {actorLabel(a.actorEmail)} · {a.detail ?? a.action}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
