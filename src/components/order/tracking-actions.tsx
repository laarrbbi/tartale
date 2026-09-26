'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

/** "Pagar ahora": a fresh Stripe page for an order whose payment was not completed. */
export function PayNowButton({ token, label }: { token: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/pedidos/${token}/pago`, { method: 'POST' });
      const body = (await response.json().catch(() => null)) as { redirect?: string; message?: string } | null;
      if (response.ok && body?.redirect) {
        window.location.assign(body.redirect);
        return;
      }
      setError(body?.message ?? 'No hemos podido abrir el pago. Inténtalo otra vez.');
    } catch {
      setError('Sin conexión. Comprueba tu cobertura e inténtalo otra vez.');
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="lg" onClick={pay} disabled={busy} className="w-full">
        {busy ? 'Abriendo el pago…' : label}
      </Button>
      {error ? (
        <p role="alert" className="type-caption text-center text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Copies the tracking link, which is the only way back to this page. */
export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href.split('?')[0]!);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          setCopied(false);
        }
      }}
      className="pressable type-caption rounded-pill bg-surface px-3.5 py-1.5 font-medium text-ink ring-1 ring-line-strong"
    >
      {copied ? 'Enlace copiado ✓' : 'Copiar el enlace'}
    </button>
  );
}
