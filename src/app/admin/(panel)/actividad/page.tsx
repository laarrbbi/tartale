import Link from 'next/link';

import { EmptyState } from '@/components/ui/stat';
import { cn } from '@/lib/cn';
import { actorLabel, formatStamp } from '@/lib/format';
import { requireOwner } from '@/server/auth/guard';
import { listAudit } from '@/server/repositories/audit';

/** What each logged action means, in words. An unknown one shows its code. */
const ACTIONS: Record<string, string> = {
  'order.paid': 'Pedido pagado',
  'order.status': 'Estado del pedido',
  'order.update': 'Pedido cambiado',
  'order.cancel': 'Pedido cancelado',
  'order.restore': 'Pedido recuperado',
  'order.refund': 'Devolución',
  'order.refund_synced': 'Devolución (desde Stripe)',
  'order.payment': 'Cobro por transferencia',
  'order.erase': 'Datos personales borrados',
  'order.birthday': 'Pedido de cumpleaños creado',
  'retention.run': 'Borrado automático (90 días)',
  'company.create': 'Empresa nueva',
  'company.update': 'Empresa cambiada',
  'company.delete': 'Empresa borrada',
  'birthday.import': 'Lista de cumpleaños',
  'birthday.update': 'Cumpleaños cambiado',
  'birthday.pause': 'Cumpleaños en pausa',
  'birthday.resume': 'Cumpleaños reactivado',
  'birthday.delete': 'Persona quitada de la lista',
  'birthday.problem': 'Cumpleaños sin pedir',
  'bakery.create': 'Pastelería nueva',
  'bakery.update': 'Pastelería cambiada',
  'zone.create': 'Zona nueva',
  'zone.update': 'Zona cambiada',
  'zone.delivery': 'Precio de entrega',
  'cake.create': 'Tarta nueva',
  'cake.update': 'Tarta cambiada',
  'settings.update': 'Ajustes',
  'schema.update': 'Base de datos actualizada',
  'setup.schema': 'Base de datos creada',
  'account.create': 'Cuenta nueva',
  'account.password_reset': 'Contraseña temporal nueva',
  'account.activate': 'Cuenta reactivada',
  'account.deactivate': 'Cuenta desactivada',
  'login.success': 'Entrada al panel',
  'login.failed': 'Contraseña incorrecta',
  'login.failed_code': 'Código de 2 pasos incorrecto',
  'login.blocked_locked': 'Intento con la cuenta bloqueada',
  logout: 'Salida del panel',
  'password.changed': 'Contraseña cambiada',
  'totp.enabled': 'Verificación en 2 pasos activada',
  'totp.disabled': 'Verificación en 2 pasos desactivada',
};

const FILTERS = {
  todo: { label: 'Todo', kinds: null },
  pedidos: { label: 'Pedidos', kinds: ['order'] },
  catalogo: { label: 'Pastelerías y carta', kinds: ['bakery', 'zone', 'cake'] },
  cumpleanos: { label: 'Cumpleaños', kinds: ['company', 'birthday'] },
  ajustes: { label: 'Ajustes', kinds: ['settings', 'schema', 'setup', 'retention'] },
  accesos: { label: 'Accesos', kinds: ['login', 'logout', 'password', 'totp', 'account'] },
} as const;
type Filter = keyof typeof FILTERS;

const FAILED = new Set(['login.failed', 'login.failed_code', 'login.blocked_locked', 'birthday.problem']);

function targetLink(target: string | null): { href: string; label: string } | null {
  const match = target ? /^(order|bakery|account|company):(\d+)$/.exec(target) : null;
  if (!match) return null;
  const [, kind, id] = match;
  if (kind === 'order') return { href: `/admin/pedidos/${id}`, label: `pedido nº ${id}` };
  if (kind === 'bakery') return { href: `/admin/pastelerias/${id}`, label: 'pastelería' };
  if (kind === 'company') return { href: `/admin/cumpleanos/${id}`, label: 'empresa' };
  return { href: '/admin/equipo', label: 'cuenta' };
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requireOwner();
  const { ver } = await searchParams;
  const filter: Filter = ver && ver in FILTERS ? (ver as Filter) : 'todo';
  const kinds = FILTERS[filter].kinds;
  const entries = await listAudit({ limit: 300, kinds: kinds ?? undefined });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">Actividad</h1>
        <p className="type-body mt-1 max-w-prose text-pretty text-ink-muted">
          Quién cambió qué y cuándo. No se puede editar ni borrar desde el panel; se guarda dos años.
        </p>
      </div>

      <nav aria-label="Filtro" className="flex flex-wrap gap-1.5">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <Link
            key={key}
            href={key === 'todo' ? '/admin/actividad' : `/admin/actividad?ver=${key}`}
            aria-current={key === filter ? 'page' : undefined}
            className={cn(
              'rounded-pill px-3.5 py-1.5 text-[0.8125rem] font-medium ring-1 ring-line-strong',
              key === filter ? 'bg-chocolate text-ink-inverse ring-chocolate' : 'text-ink hover:bg-surface-sunken',
            )}
          >
            {FILTERS[key].label}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <EmptyState title="Nada todavía" description="Aquí aparecerá cada cambio del panel, cada pago y cada entrada." />
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-line/70">
          {entries.map((entry) => {
            const target = targetLink(entry.target);
            return (
              <li key={entry.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="type-caption type-numeric shrink-0 sm:w-28">{formatStamp(entry.createdAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn('type-body font-medium', FAILED.has(entry.action) && 'text-critical')}>
                    {ACTIONS[entry.action] ?? entry.action}
                  </span>
                  {target ? (
                    <>
                      {' · '}
                      <Link href={target.href} className="type-caption font-medium text-brand underline underline-offset-2">
                        {target.label}
                      </Link>
                    </>
                  ) : null}
                  {entry.detail ? <span className="type-caption block break-words">{entry.detail}</span> : null}
                </span>
                <span className="type-caption shrink-0 break-all">{actorLabel(entry.actorEmail)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
