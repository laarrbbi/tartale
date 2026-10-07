import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignInButtons } from '@/components/account/sign-in-buttons';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ButtonLink } from '@/components/ui/button';
import { safeReturnPath, signInErrorMessage } from '@/lib/accounts';
import { getCustomerSession, hasCustomerCookie } from '@/server/auth/customer-session';
import { configuredProviders } from '@/server/auth/oidc';
import { customerAccountsReady } from '@/server/repositories/customers';

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Entra con Google, Apple o Microsoft para tener tus pedidos a mano y tus datos rellenos en cada pedido.',
  robots: { index: false, follow: false },
};

/**
 * Sign in. There are no passwords here: Google, Apple or Microsoft confirm
 * who the person is, and only the providers the owner has switched on (with
 * their keys in Vercel) get a button.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const returnTo = safeReturnPath(query.volver);
  const ready = await customerAccountsReady();
  if (ready && (await hasCustomerCookie()) && (await getCustomerSession())) redirect(returnTo);

  const providers = ready ? configuredProviders() : [];
  const error = signInErrorMessage(query.error);
  const deleted = query.borrada === '1';

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-md px-5 pb-24 pt-10 md:pt-16">
        <h1 className="type-display text-balance">Entra en tu cuenta</h1>

        {deleted ? (
          <p role="status" className="type-caption mt-6 rounded-field bg-positive-soft px-4 py-3 font-medium text-positive">
            Tu cuenta y tus datos guardados se han borrado.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="type-caption mt-6 rounded-field bg-critical-soft px-4 py-3 font-medium text-critical">
            {error}
          </p>
        ) : null}

        {providers.length > 0 ? (
          <>
            <p className="type-lead mt-4 text-pretty">
              Con cuenta, cada pedido empieza con tus datos y los de tu empresa ya puestos, y tienes todos tus pedidos a mano.
            </p>
            <div className="mt-8">
              <SignInButtons providers={providers} returnTo={returnTo} />
            </div>
            <p className="type-caption mt-6 text-pretty">
              No hay contraseñas: el servicio con el que entres confirma quién eres y nos da tu nombre y tu email, nada más. Si es
              la primera vez, la cuenta se crea al entrar. Más en{' '}
              <Link href="/privacidad" className="font-medium text-brand underline underline-offset-2">
                privacidad
              </Link>
              .
            </p>
          </>
        ) : (
          <p className="type-lead mt-4 text-pretty">Las cuentas todavía no están abiertas.</p>
        )}

        <div className="mt-10 rounded-card bg-surface p-5 ring-1 ring-line/70">
          <p className="type-body font-medium">No hace falta cuenta para enviar una tarta.</p>
          <ButtonLink href="/enviar" variant="secondary" size="sm" className="mt-3">
            Enviar una tarta
          </ButtonLink>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
