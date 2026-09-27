import type { Metadata } from 'next';

import { OrderFlow } from '@/components/order/order-flow';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { addDays, earliestDelivery, madridToday } from '@/lib/dates';
import { whatsappLink } from '@/lib/whatsapp';
import { stripeConfigured } from '@/server/payments/stripe';
import { getSettings } from '@/server/repositories/settings';
import { publicMenus } from '@/server/services/catalog-service';

export const metadata: Metadata = {
  title: 'Enviar una tarta',
  description: 'Elige la tarta, escribe la tarjeta y, si quieres, añade tu CV o tu propuesta impresos. Dinos a quién va y cuándo.',
};

/**
 * The order form. Everything it shows — cakes, sizes, prices, postcodes, the
 * earliest day — comes from the database; everything it sends is checked
 * again by the server (services/order-service.ts).
 */
export default async function SendPage() {
  const [menus, settings] = await Promise.all([publicMenus(), getSettings()]);
  const menu = menus[0];
  const earliest = earliestDelivery(settings);
  const latest = addDays(madridToday(), settings.maxDaysAhead);
  const payments = stripeConfigured();
  const contact = whatsappLink(settings.whatsappNumber, 'Hola, quería enviar una tarta');

  return (
    <>
      <SiteHeader cta={false} />
      <main id="main" className="mx-auto w-full max-w-5xl px-5 pb-20 pt-8 md:pt-12">
        <header className="mb-8 max-w-2xl">
          <h1 className="type-display text-balance">Envía una tarta{menu ? ` en ${menu.city}` : ''}</h1>
          <p className="type-lead mt-3 text-pretty">
            La tarta y la tarjeta, a quién va y cuándo, y tus datos. Pagas al final, con tarjeta.
          </p>
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
            <OrderFlow menu={menu} earliest={earliest} latest={latest} closedWeekdays={settings.closedWeekdays} />
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
