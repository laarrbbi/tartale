import { AccountControls, NewAccountForm } from '@/components/admin/team-forms';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { formatWhen } from '@/lib/format';
import { requireOwner } from '@/server/auth/guard';
import { listAdminAccounts } from '@/server/repositories/users';

const ROLE = { owner: 'Propietario', staff: 'Equipo' } as const;

export default async function TeamPage() {
  const session = await requireOwner();
  const accounts = await listAdminAccounts();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">Equipo</h1>
        <p className="type-body mt-1 max-w-prose text-pretty text-ink-muted">
          Quién entra en el panel. El equipo lleva los pedidos y ve las pastelerías; solo quien es propietario toca el dinero,
          los ajustes y las cuentas.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-line/70">
        {accounts.map((account) => {
          const self = account.id === session.user.id;
          return (
            <li key={account.id} className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="type-body mr-1 font-medium">{account.displayName}</p>
                <Badge tone={account.role === 'owner' ? 'brand' : 'neutral'}>{ROLE[account.role]}</Badge>
                {!account.isActive ? <Badge tone="critical">Desactivada</Badge> : null}
                {account.twoFactor ? <Badge tone="positive">2 pasos</Badge> : null}
                {self ? <span className="type-caption text-brand">tú</span> : null}
              </div>
              <p className="type-caption -mt-2 break-all">
                {account.email} · último acceso: {account.lastLoginAt ? formatWhen(account.lastLoginAt) : 'nunca'}
              </p>
              {self ? null : <AccountControls id={account.id} email={account.email} active={account.isActive} csrfToken={session.csrfToken} />}
            </li>
          );
        })}
      </ul>

      <Card>
        <CardHeader
          title="Dar acceso a alguien"
          description="Se crea con una contraseña temporal que verás una sola vez. Al entrar, tendrá que elegir la suya."
        />
        <CardBody className="pt-2">
          <NewAccountForm csrfToken={session.csrfToken} />
        </CardBody>
      </Card>
    </div>
  );
}
