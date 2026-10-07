import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountDetailsForm, DeleteAccountForm, SignOutForm } from '@/components/account/account-forms';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { PROVIDER_LABELS } from '@/lib/accounts';
import { longDate } from '@/lib/dates';
import { PAYMENT_STATUSES, SIZES, STATUSES, formatEuros } from '@/lib/orders';
import { requireCustomer } from '@/server/auth/guard';
import { getCustomerBilling, listCustomerOrders, listIdentities } from '@/server/repositories/customers';

export const metadata: Metadata = {
  title: 'Tu cuenta',
  robots: { index: false, follow: false },
};

function joinLabels(labels: string[]): string {
  return labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}`;
}

/** The customer's orders, their saved details, and the way out: sign out, or delete it all. */
export default async function AccountPage() {
  const session = await requireCustomer('/cuenta');
  const { customer, csrfToken } = session;
  const [orders, identities, billing] = await Promise.all([
    listCustomerOrders(customer.id),
    listIdentities(customer.id),
    getCustomerBilling(customer.id),
  ]);
  const via = joinLabels([...new Set(identities.map((i) => PROVIDER_LABELS[i.provider]))]);
  const firstName = customer.name?.split(' ')[0];

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl px-5 pb-24 pt-10 md:pt-14">
        <header>
          <h1 className="type-display text-balance">{firstName ? `Hola, ${firstName}` : 'Tu cuenta'}</h1>
          <p className="type-body mt-2 text-ink-muted">
            {customer.email ?? 'Sin email'}
            {via ? ` · entras con ${via}` : ''}
          </p>
        </header>

        <section aria-labelledby="orders-title" className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <h2 id="orders-title" className="type-title">
              Tus pedidos
            </h2>
            {orders.length > 0 ? (
              <ButtonLink href="/enviar" size="sm">
                Enviar otra
              </ButtonLink>
            ) : null}
          </div>
          {orders.length === 0 ? (
            <div className="mt-4 rounded-card bg-surface p-6 ring-1 ring-line/70">
              <p className="type-body">Aún no has hecho ningún pedido con esta cuenta.</p>
              <ButtonLink href="/enviar" size="sm" className="mt-4">
                Enviar una tarta
              </ButtonLink>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-line rounded-card bg-surface ring-1 ring-line/70">
              {orders.map((order) => {
                const paid = order.paymentStatus !== 'pendiente' && order.paymentStatus !== 'caducado';
                const status = paid ? STATUSES[order.status] : null;
                const payment = PAYMENT_STATUSES[order.paymentStatus];
                const recipient = order.erased ? null : [order.recipientName, order.recipientCompany].filter(Boolean).join(', ');
                return (
                  <li key={order.publicId}>
                    <Link href={`/pedido/${order.publicId}`} className="flex items-start gap-4 px-5 py-4 hover:bg-surface-sunken/60">
                      <div className="min-w-0 flex-1">
                        <p className="type-body font-medium">
                          {order.cakeName}, {SIZES[order.size].label.toLowerCase()}
                          {recipient ? <span className="font-normal text-ink-muted"> · para {recipient}</span> : null}
                        </p>
                        <p className="type-caption mt-0.5">
                          Entrega el {longDate(order.deliverOn)}
                          {order.erased ? ' · datos de la entrega ya borrados' : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="type-body type-numeric">{formatEuros(order.totalCents)}</span>
                        {status ? (
                          <Badge tone={status.tone}>{status.customer}</Badge>
                        ) : (
                          <Badge tone={payment.tone}>{payment.label}</Badge>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="details-title" className="mt-12">
          <h2 id="details-title" className="type-title">
            Tus datos
          </h2>
          <p className="type-caption mt-1 text-pretty">Con ellos empieza relleno cada pedido. Puedes cambiarlos en el propio pedido.</p>
          <div className="mt-5">
            <AccountDetailsForm
              csrfToken={csrfToken}
              values={{ name: customer.name ?? '', phone: customer.phone ?? '', company: customer.company ?? '', billing }}
            />
          </div>
        </section>

        <section aria-labelledby="leave-title" className="mt-12 flex flex-col gap-6 border-t border-line pt-8">
          <h2 id="leave-title" className="sr-only">
            Salir o borrar la cuenta
          </h2>
          <SignOutForm csrfToken={csrfToken} />
          <div>
            <h3 className="type-heading">Borrar tu cuenta</h3>
            <p className="type-caption mt-1 text-pretty">
              Se borran al momento tu cuenta, tus datos guardados y tus inicios de sesión. Los pedidos ya hechos se quedan sin
              cuenta y siguen las mismas reglas que cualquier otro pedido.
            </p>
            <div className="mt-4">
              <DeleteAccountForm csrfToken={csrfToken} />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
