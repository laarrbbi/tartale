'use client';

import { Button } from '@/components/ui/button';

/** Never shows the error itself: its message can carry internals. The digest is enough to find it in the logs. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 py-16 text-center">
      <h1 className="type-display">Algo ha fallado</h1>
      <p className="type-lead mt-3 text-pretty">No es culpa tuya. Vuelve a intentarlo en un momento.</p>
      {error.digest ? <p className="type-caption mt-2">Referencia: {error.digest}</p> : null}
      <Button className="mt-8" onClick={() => reset()}>
        Reintentar
      </Button>
    </main>
  );
}
