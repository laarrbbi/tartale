import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/admin/login-form';
import { Logo } from '@/components/site/logo';
import { getSession } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Panel', robots: { index: false, follow: false } };

export default async function LoginPage() {
  // Never a login form over a live session.
  if (await getSession()) redirect('/admin');
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 py-10">
      <div className="flex flex-col items-center text-center">
        <Logo />
        <h1 className="type-title mt-5">Panel del equipo</h1>
        <p className="type-caption mt-1.5">Pedidos, pastelerías y ajustes.</p>
      </div>
      <LoginForm />
      <p className="type-caption text-center text-pretty">Varios intentos fallidos seguidos bloquean la cuenta 15 minutos.</p>
    </main>
  );
}
