import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  BirthdayControls,
  BirthdayEditForm,
  CompanyForm,
  DeleteBirthdayForm,
  DeleteCompanyForm,
  ImportBirthdaysForm,
  type CakeOption,
} from '@/components/admin/birthday-forms';
import { CompanyInvoiceForm, CompanyTaxForm } from '@/components/admin/invoice-forms';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { formatDayMonth, planBirthday } from '@/lib/birthdays';
import { dayMonth, longDate, madridToday } from '@/lib/dates';
import { plural } from '@/lib/format';
import { INVOICE_SERIES, invoiceDate } from '@/lib/invoices';
import { SIZES, STATUSES, formatEuros } from '@/lib/orders';
import { telHref } from '@/lib/whatsapp';
import { requireOwner } from '@/server/auth/guard';
import { birthdayOrders, findCompany, getCompanyTax, listBirthdays } from '@/server/repositories/birthdays';
import { listCompanyOrdersToInvoice, listInvoicesForCompany } from '@/server/repositories/invoices';
import { getSettings } from '@/server/repositories/settings';
import { loadCatalog, resolveBirthday } from '@/server/services/birthday-service';
import { businessDetails, invoiceableCents, invoicingGaps } from '@/server/services/invoice-service';

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireOwner();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const company = await findCompany(id);
  if (!company) notFound();

  const today = madridToday();
  const [people, settings, catalog] = await Promise.all([listBirthdays({ companyId: company.id }), getSettings(), loadCatalog()]);
  const orders = await birthdayOrders(people.map((p) => p.id));
  const activeBakeries = new Set(catalog.bakeries.filter((b) => b.active).map((b) => b.id));
  const cakes: CakeOption[] = catalog.cakes
    .filter((c) => c.active && activeBakeries.has(c.bakeryId))
    .map((c) => ({ id: c.id, name: c.name, prices: c.prices }));
  const cakeName = new Map(catalog.cakes.map((c) => [c.id, c.name]));
  const tel = telHref(company.contactPhone);
  // Before the database update that adds invoices, their cards are left out.
  const billing = await Promise.all([
    getCompanyTax(company.id),
    listInvoicesForCompany(company.id),
    listCompanyOrdersToInvoice(company.id),
    businessDetails(),
  ]).catch(() => null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/cumpleanos" className="type-caption font-medium text-ink-muted hover:text-ink">
          ← Cumpleaños
        </Link>
        <h1 className="type-display mt-2">{company.name}</h1>
        <p className="type-body mt-1 text-ink-muted">
          {company.contactName} ·{' '}
          {tel ? (
            <a href={tel} className="text-brand underline underline-offset-2">
              {company.contactPhone}
            </a>
          ) : (
            company.contactPhone
          )}
          {company.contactEmail ? ` · ${company.contactEmail}` : ''}
        </p>
      </div>

      <Card>
        <CardHeader title={`La lista (${people.length})`} description="Cada tarta se pide sola una semana antes de salir. Pausa a quien esté de vacaciones o de baja." />
        <CardBody className="flex flex-col gap-3 pt-2">
          {people.length === 0 ? <p className="type-caption">Todavía no hay nadie: pega la lista más abajo.</p> : null}
          {people.map((person) => {
            const plan = planBirthday(person, settings.closedWeekdays, today);
            const order = orders.find((o) => o.birthdayId === person.id && o.year === plan.year);
            const resolved = resolveBirthday(person, catalog);
            return (
              <div key={person.id} className="rounded-field bg-surface-sunken/50 px-4 py-3 ring-1 ring-line/60">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="type-body mr-1 font-medium">{person.recipientName}</p>
                  <span className="type-caption">🎂 {dayMonth(person.day, person.month)}</span>
                  {!person.active ? <Badge>En pausa</Badge> : null}
                </div>
                <p className="type-caption mt-0.5">
                  {person.addressKind === 'oficina' ? '🏢' : '🏠'} {person.address}, {person.postalCode} · {cakeName.get(person.cakeId) ?? 'tarta'}{' '}
                  {SIZES[person.size].label.toLowerCase()}
                </p>
                {person.active ? (
                  order ? (
                    <p className="type-caption mt-1">
                      Este año:{' '}
                      <Link href={`/admin/pedidos/${order.orderId}`} className="font-medium text-brand underline underline-offset-2">
                        pedido nº {order.orderId}
                      </Link>{' '}
                      · {STATUSES[order.status].label} · sale el {longDate(order.deliverOn)}
                    </p>
                  ) : (
                    <p className="type-caption mt-1">
                      Sale el {longDate(plan.deliverOn)}
                      {plan.deliverOn !== plan.birthday ? ` (cumple el ${longDate(plan.birthday)})` : ''} · se pide{' '}
                      {today >= plan.createOn ? 'esta noche' : `el ${longDate(plan.createOn)}`}
                    </p>
                  )
                ) : null}
                {!resolved.ok ? <p className="type-caption mt-1 font-medium text-critical">{resolved.problem}</p> : null}
                <div className="mt-2">
                  <BirthdayControls id={person.id} active={person.active} csrfToken={session.csrfToken} />
                </div>
                <details className="mt-2">
                  <summary className="type-caption cursor-pointer font-medium text-brand">Editar</summary>
                  <div className="mt-3">
                    <BirthdayEditForm
                      person={{
                        id: person.id,
                        recipientName: person.recipientName,
                        recipientCompany: person.recipientCompany,
                        birthday: formatDayMonth(person.day, person.month),
                        addressKind: person.addressKind,
                        address: person.address,
                        postalCode: person.postalCode,
                        deliveryNotes: person.deliveryNotes,
                        cakeId: person.cakeId,
                        size: person.size,
                        cakeText: person.cakeText,
                        cardDesign: person.cardDesign,
                        cardMessage: person.cardMessage,
                        signOff: person.signOff,
                        timeSlot: person.timeSlot,
                      }}
                      cakes={cakes}
                      csrfToken={session.csrfToken}
                    />
                    <div className="mt-4 border-t border-line pt-4">
                      <DeleteBirthdayForm id={person.id} name={person.recipientName} csrfToken={session.csrfToken} />
                    </div>
                  </div>
                </details>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Añadir personas"
          description="Pega la lista desde Excel o escríbela. Solo se usa para entregar su tarta; si alguien deja la empresa, quítalo."
        />
        <CardBody className="pt-2">
          <ImportBirthdaysForm companyId={company.id} companyName={company.name} cakes={cakes} csrfToken={session.csrfToken} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Datos de la empresa" description={`${plural(orders.length, 'pedido hecho', 'pedidos hechos')} hasta hoy.`} />
        <CardBody className="pt-2">
          <CompanyForm
            company={{
              id: company.id,
              name: company.name,
              contactName: company.contactName,
              contactPhone: company.contactPhone,
              contactEmail: company.contactEmail,
              billingNotes: company.billingNotes,
            }}
            csrfToken={session.csrfToken}
          />
        </CardBody>
      </Card>

      {billing ? (
        <>
          <Card>
            <CardHeader
              title="Datos fiscales"
              description="Para sus facturas: razón social, NIF y dirección fiscal. Las facturas ya emitidas no cambian."
            />
            <CardBody className="pt-2">
              <CompanyTaxForm companyId={company.id} values={billing[0] ?? {}} csrfToken={session.csrfToken} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Facturas"
              description="Una factura por los pedidos que marques (los de un mes, por ejemplo). Se pagan por transferencia."
            />
            <CardBody className="flex flex-col gap-4 pt-2">
              {billing[1].length > 0 ? (
                <ul className="flex flex-col divide-y divide-line">
                  {billing[1].map((doc) => (
                    <li key={doc.id} className="flex items-baseline justify-between gap-3 py-2">
                      <Link href={`/admin/facturas/${doc.id}`} className="type-body font-medium underline decoration-line-strong underline-offset-4">
                        {doc.number}
                      </Link>
                      <span className="type-caption min-w-0 flex-1 truncate">
                        {INVOICE_SERIES[doc.series].label} · {invoiceDate(doc.issuedOn)}
                      </span>
                      <span className="type-body type-numeric">{formatEuros(doc.totalCents)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {billing[2].length === 0 ? (
                <p className="type-caption">No hay pedidos sin facturar.</p>
              ) : invoicingGaps(billing[3]).length > 0 ? (
                <p className="type-caption">
                  Para facturar faltan datos de Tartame en{' '}
                  <Link href="/admin/ajustes" className="font-medium text-brand underline underline-offset-2">
                    Ajustes
                  </Link>
                  .
                </p>
              ) : !billing[0] ? (
                <p className="type-caption">Para facturar, rellena antes sus datos fiscales.</p>
              ) : (
                <CompanyInvoiceForm
                  companyId={company.id}
                  orders={billing[2].map((o) => ({
                    id: o.id,
                    label: `Nº ${o.id} · ${o.cakeName} ${SIZES[o.size].label.toLowerCase()} · ${longDate(o.deliverOn)} · ${STATUSES[o.status].label}`,
                    cents: invoiceableCents(o),
                    delivered: o.status === 'entregado',
                  }))}
                  csrfToken={session.csrfToken}
                />
              )}
            </CardBody>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader
          title="Borrar la empresa"
          description="Se borra la empresa y toda su lista. Los pedidos ya hechos se quedan, y pierden sus datos personales a los 90 días como todos."
        />
        <CardBody className="pt-2">
          <DeleteCompanyForm id={company.id} csrfToken={session.csrfToken} />
        </CardBody>
      </Card>
    </div>
  );
}
