import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { EmptyState, Stat } from '@/components/ui/stat';
import { cn } from '@/lib/cn';
import { madridToday, relativeDayLabel } from '@/lib/dates';
import { OCCASIONS, PAYMENT_STATUSES, SIZES, SLOTS, STATUSES, formatEuros } from '@/lib/orders';
import { requireSession } from '@/server/auth/guard';
import { listBakeries } from '@/server/repositories/catalog';
import { ORDER_FILTERS, getOrderStats, listOrders, type Order, type OrderFilter } from '@/server/repositories/orders';

/**
 * The board: orders by delivery day, the day's first. New ones are to be
 * confirmed with whoever sent them before they go in the oven.
 */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ ver?: string; pasteleria?: string }> }) {
  const session = await requireSession();
  const { ver, pasteleria } = await searchParams;
  const filter: OrderFilter = ver && ver in ORDER_FILTERS ? (ver as OrderFilter) : 'activos';
  const today = madridToday();
  const bakeryId = pasteleria && /^\d+$/.test(pasteleria) ? Number(pasteleria) : undefined;
  const [orders, stats, bakeries] = await Promise.all([listOrders({ filter, today, bakeryId }), getOrderStats(today), listBakeries()]);
  const bakeryName = new Map(bakeries.map((b) => [b.id, b.name]));

  const byDay = new Map<string, Order[]>();
  for (const order of orders) byDay.set(order.deliverOn, [...(byDay.get(order.deliverOn) ?? []), order]);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="type-display">Pedidos</h1>
          <p className="type-body mt-1 max-w-prose text-pretty text-ink-muted">
            Por día de entrega. Los nuevos se confirman con quien los envía antes de hornearlos.
          </p>
        </div>
        <Link href="/" target="_blank" className="type-caption font-medium text-brand underline underline-offset-2">
          Ver la web ↗
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Por confirmar" value={String(stats.toConfirm)} tone={stats.toConfirm > 0 ? 'caution' : 'neutral'} />
        <Stat label="Hoy" value={String(stats.today)} />
        <Stat label="Próximos 7 días" value={String(stats.week)} />
        <Stat
          label="Ingresos del mes"
          value={formatEuros(stats.monthCents)}
          hint={`${stats.monthCount} ${stats.monthCount === 1 ? 'tarta' : 'tartas'} este mes${session.user.role === 'owner' && stats.unpaid ? ` · ${stats.unpaid} por cobrar` : ''}`}
        />
      </div>

      <nav aria-label="Filtro" className="flex flex-wrap gap-1.5">
        {(Object.keys(ORDER_FILTERS) as OrderFilter[]).map((key) => (
          <Link
            key={key}
            href={key === 'activos' ? '/admin' : `/admin?ver=${key}`}
            aria-current={key === filter ? 'page' : undefined}
            className={cn(
              'rounded-pill px-3.5 py-1.5 text-[0.8125rem] font-medium ring-1 ring-line-strong',
              key === filter ? 'bg-chocolate text-ink-inverse ring-chocolate' : 'text-ink hover:bg-surface-sunken',
            )}
          >
            {ORDER_FILTERS[key]}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <EmptyState
          title="Nada por aquí"
          description={filter === 'sin_pagar' ? 'Ningún pedido a medio pagar.' : 'Cuando alguien envíe una tarta desde la web, aparecerá aquí.'}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {[...byDay.entries()].map(([day, list]) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="type-heading first-letter:uppercase">
                {relativeDayLabel(day, today)} <span className="type-caption">({list.length})</span>
              </h2>
              <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-line/70">
                {list.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/pedidos/${o.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-sunken/60">
                      <span className="text-xl" aria-hidden>
                        {OCCASIONS[o.occasion].emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="type-body block truncate font-medium">
                          {o.recipientName ?? 'Datos borrados'}
                          {o.recipientCompany ? ` · ${o.recipientCompany}` : ''}
                        </span>
                        <span className="type-caption block truncate">
                          nº {o.id} · {SLOTS[o.timeSlot].hours} · {o.cakeName} {SIZES[o.size].label.toLowerCase()}
                          {o.hasPhoto ? ' · 📸' : ''}
                          {o.postalCode ? ` · ${o.postalCode}` : ''}
                          {bakeries.length > 1 ? ` · ${bakeryName.get(o.bakeryId) ?? ''}` : ''}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <Badge tone={STATUSES[o.status].tone}>{STATUSES[o.status].label}</Badge>
                        {o.paymentStatus !== 'pagado' ? (
                          <Badge tone={PAYMENT_STATUSES[o.paymentStatus].tone}>{PAYMENT_STATUSES[o.paymentStatus].label}</Badge>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
