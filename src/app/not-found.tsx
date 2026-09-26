import { SiteHeader } from '@/components/site/site-header';
import { ButtonLink } from '@/components/ui/button';

export default function NotFound() {
  return (
    <>
      <SiteHeader cta={false} />
      <main id="main" className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="type-eyebrow">404</p>
        <h1 className="type-display mt-3">Aquí no hay tarta</h1>
        <p className="type-lead mt-3 text-pretty">
          Esta página no existe. Si venías de un enlace de seguimiento, puede que ya no esté disponible.
        </p>
        <ButtonLink href="/" className="mt-8" variant="secondary">
          Volver al inicio
        </ButtonLink>
      </main>
    </>
  );
}
