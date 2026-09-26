import Link from 'next/link';

import { NewBakeryForm } from '@/components/admin/bakery-forms';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/stat';
import { plural } from '@/lib/format';
import { formatEuros } from '@/lib/orders';
import { formatPostcodes } from '@/lib/zones';
import { requireSession } from '@/server/auth/guard';
import { listBakeries, listCakes, listZones } from '@/server/repositories/catalog';
import { countActiveOrdersByBakery } from '@/server/repositories/orders';

export default async function BakeriesPage() {
  const session = await requireSession();
  const isOwner = session.user.role === 'owner';
  const [bakeries, zones, cakes, pending] = await Promise.all([listBakeries(), listZones(), listCakes(), countActiveOrdersByBakery()]);

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="type-display">Pastelerías</h1>
        <p className="type-body mt-1 max-w-prose text-pretty text-ink-muted">
          Las pastelerías con las que trabajamos: dónde reparte cada una, su carta y sus precios. Cada pedido va solo a la
          pastelería que reparte en su código postal.
        </p>
      </div>

      {bakeries.length === 0 ? (
        <EmptyState title="Ninguna todavía" description="Añade la primera pastelería, sus zonas de reparto y su carta." />
      ) : (
        <ul className="flex flex-col gap-3">
          {bakeries.map((bakery) => {
            const own = zones.filter((z) => z.bakeryId === bakery.id && z.active);
            const menu = cakes.filter((c) => c.bakeryId === bakery.id && c.active);
            const deliveries = [...new Set(own.map((z) => z.deliveryCents))].sort((a, b) => a - b);
            const toDeliver = pending.get(bakery.id) ?? 0;
            return (
              <li key={bakery.id}>
                <Link
                  href={`/admin/pastelerias/${bakery.id}`}
                  className="flex flex-col gap-2 rounded-card bg-surface px-5 py-4 ring-1 ring-line/70 hover:bg-surface-sunken/50"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="type-heading mr-1">{bakery.name}</span>
                    <Badge tone={bakery.active ? 'positive' : 'neutral'}>{bakery.active ? 'Activa' : 'Pausada'}</Badge>
                    {bakery.printsPhotos ? <Badge tone="brand">Imprime fotos</Badge> : null}
                  </span>
                  <span className="type-caption">
                    {bakery.city}
                    {own.length > 0 ? ` · reparte en ${formatPostcodes(own.flatMap((z) => z.postalCodes))}` : ' · sin zona de reparto'}
                    {deliveries.length > 0 ? ` · entrega ${deliveries.map(formatEuros).join(' / ')}` : ''}
                  </span>
                  <span className="type-caption">
                    {plural(menu.length, 'tarta en la carta', 'tartas en la carta')} · {plural(toDeliver, 'pedido por entregar', 'pedidos por entregar')}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {isOwner ? (
        <Card>
          <CardHeader
            title="Añadir una pastelería"
            description="Después, en su página: sus datos, a qué códigos postales reparte y su carta con precios."
          />
          <CardBody className="pt-2">
            <NewBakeryForm csrfToken={session.csrfToken} />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
