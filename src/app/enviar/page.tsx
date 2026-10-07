import type { Metadata } from 'next';
import Link from 'next/link';

import { OrderFlow, type AccountPrefill } from '@/components/order/order-flow';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { addDays, earliestDelivery, madridToday } from '@/lib/dates';
import { whatsappLink } from '@/lib/whatsapp';
import { getCustomerSession, hasCustomerCookie } from '@/server/auth/customer-session';
import { configuredProviders } from '@/server/auth/oidc';
import { stripeConfigured } from '@/server/payments/stripe';
import { getCustomerBilling } from '@/server/repositories/customers';
import { getSettings } from '@/server/repositories/settings';
import { publicMenus } from '@/server/services/catalog-service';

export const metadata: Metadata = {
  title: 'Enviar una tarta',
  description: 'Dinos a quién va, diseña la tarta con tu foto y tu frase, escribe la tarjeta y, si quieres, añade tu CV o tu propuesta a la caja.',
};

/**
 * The order form. Everything it shows — cakes, sizes, prices, postcodes, the
 * earliest day — comes from the database; everything it sends is checked
 * again by the server (services/order-service.ts).
 */
export default async function SendPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [menus, settings, query] = await Promise.all([publicMenus(), getSettings(), searchParams]);
  // From "¿Llegáis a…?" on /zonas: the postcode they just checked.
  const postcode = typeof query.cp === 'string' && /^\d{5}$/.test(query.cp) ? query.cp : '';
  const menu = menus[0];
  const earliest = earliestDelivery(settings);
  const latest = addDays(madridToday(), settings.maxDaysAhead);
  const payments = stripeConfigured();
  const contact = whatsappLink(settings.whatsappNumber, 'Hola, quería enviar una tarta');
  const account = await accountPrefill();
  const canSignIn = !account && configuredProviders().length > 0;

  return (
    <>
      <SiteHeader cta={false} />
      <main id="main" className="mx-auto w-full max-w-5xl px-5 pb-20 pt-8 md:pt-12">
        <header className="mb-8 max-w-2xl">
          <h1 className="type-display text-balance">Envía una tarta{menu ? ` en ${menu.city}` : ''}</h1>
          <p className="type-lead mt-3 text-pretty">
            A quién va, cómo es y pagar. Tu foto y tu frase van impresas encima; tu tarjeta, en la caja.
          </p>
          {canSignIn ? (
            <p className="type-caption mt-3">
              ¿Tienes cuenta?{' '}
              <Link href="/entrar?volver=/enviar" className="font-medium text-brand underline underline-offset-2">
                Entra
              </Link>{' '}
              y tus datos se rellenan solos.
            </p>
          ) : null}
        </header>

        {!menu || !settings.ordersEnabled ? (
          <div className="rounded-card bg-surface p-8 text-center ring-1 ring-line/70">
            <p className="type-title">Ahora mismo no estamos aceptando pedidos</p>
            <p className="type-body mt-2 text-ink-muted">Vuelve a intentarlo en unos días.</p>
            {contact ? (
              <a href={contact} className="type-body mt-4 inline-block font-medium text-brand underline underline-offset-2">
                Escríbenos por WhatsApp
              </a>
            ) : null}
          </div>
        ) : (
          <>
            {!payments ? (
              <p className="type-caption mb-6 rounded-field bg-caution-soft px-4 py-3 text-caution">
                Estamos activando los pagos online: todavía no se puede completar un pedido.
              </p>
            ) : null}
            <OrderFlow
              menu={menu}
              earliest={earliest}
              latest={latest}
              closedWeekdays={settings.closedWeekdays}
              initialPostcode={postcode}
              account={account}
            />
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

/** A signed-in customer's details, to start the form with. Nothing is asked of the database without a session cookie. */
async function accountPrefill(): Promise<AccountPrefill | null> {
  if (!(await hasCustomerCookie())) return null;
  const session = await getCustomerSession();
  if (!session) return null;
  const { customer } = session;
  return {
    name: customer.name ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    company: customer.company ?? '',
    billing: await getCustomerBilling(customer.id),
  };
}
