import Link from 'next/link';

import { NewCompanyForm } from '@/components/admin/birthday-forms';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/stat';
import { BIRTHDAY_LEAD_DAYS, planBirthday } from '@/lib/birthdays';
import { daysBetween, longDate, madridToday, relativeDayLabel } from '@/lib/dates';
import { plural } from '@/lib/format';
import { STATUSES } from '@/lib/orders';
import { requireOwner } from '@/server/auth/guard';
import { birthdayOrders, listBirthdays, listCompanies } from '@/server/repositories/birthdays';
import { getSettings } from '@/server/repositories/settings';
import { loadCatalog, resolveBirthday } from '@/server/services/birthday-service';

const UPCOMING_DAYS = 30;

/**
 * Company birthdays, offered on request (not on the public site): each
 * company's team list, and every cake that goes out on its own a week before.
 */
export default async function BirthdaysPage() {
  const session = await requireOwner();
  const today = madridToday();
  const [companies, people, settings, catalog] = await Promise.all([
    listCompanies(),
    listBirthdays({ activeOnly: true }),
    getSettings(),
    loadCatalog(),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const upcoming = people
    .map((person) => ({ person, plan: planBirthday(person, settings.closedWeekdays, today) }))
    .filter(({ plan }) => daysBetween(today, plan.deliverOn) <= UPCOMING_DAYS)
    .sort((a, b) => a.plan.deliverOn.localeCompare(b.plan.deliverOn));
  const orders = await birthdayOrders(upcoming.map((u) => u.person.id));

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="type-display">Cumpleaños</h1>
        <p className="type-body mt-1 max-w-prose text-pretty text-ink-muted">
          Para empresas que lo piden: pegas su lista una vez y cada tarta se pide sola {BIRTHDAY_LEAD_DAYS} días antes, como un
          pedido «Nuevo» que confirmas con la empresa. Se cobra por transferencia.
        </p>
      </div>

      <Card>
        <CardHeader title="Próximos 30 días" description="Lo que va a salir, y si su pedido ya está creado." />
        <CardBody className="pt-2">
          {upcoming.length === 0 ? (
            <p className="type-caption">Ningún cumpleaños en los próximos {UPCOMING_DAYS} días.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {upcoming.map(({ person, plan }) => {
                const order = orders.find((o) => o.birthdayId === person.id && o.year === plan.year);
                const resolved = resolveBirthday(person, catalog);
                return (
                  <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="type-body font-medium">
                        {person.recipientName} <span className="type-caption">· {companyName.get(person.companyId)}</span>
                      </p>
                      <p className="type-caption first-letter:uppercase">
                        {relativeDayLabel(plan.deliverOn, today)}
                        {plan.deliverOn !== plan.birthday ? ` (cumple el ${longDate(plan.birthday)})` : ''}
                      </p>
                      {!resolved.ok ? <p className="type-caption font-medium text-critical">{resolved.problem}</p> : null}
                    </div>
                    {order ? (
                      <Link href={`/admin/pedidos/${order.orderId}`} className="flex items-center gap-2">
                        <span className="type-caption font-medium text-brand underline underline-offset-2">nº {order.orderId}</span>
                        <Badge tone={STATUSES[order.status].tone}>{STATUSES[order.status].label}</Badge>
                      </Link>
                    ) : (
                      <Badge>{today >= plan.createOn ? 'Se pide esta noche' : `Se pide el ${longDate(plan.createOn)}`}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {companies.length === 0 ? (
        <EmptyState title="Ninguna empresa todavía" description="Añade la primera y pega su lista de cumpleaños." />
      ) : (
        <ul className="flex flex-col gap-3">
          {companies.map((company) => (
            <li key={company.id}>
              <Link
                href={`/admin/cumpleanos/${company.id}`}
                className="flex flex-col gap-1 rounded-card bg-surface px-5 py-4 ring-1 ring-line/70 hover:bg-surface-sunken/50"
              >
                <span className="type-heading">{company.name}</span>
                <span className="type-caption">
                  {company.contactName} · {plural(company.people, 'persona', 'personas')}
                  {company.people !== company.active ? ` (${company.people - company.active} en pausa)` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader title="Añadir una empresa" description="Quién paga y con quién hablamos. Después, en su página, pegas la lista." />
        <CardBody className="pt-2">
          <NewCompanyForm csrfToken={session.csrfToken} />
        </CardBody>
      </Card>
    </div>
  );
}
