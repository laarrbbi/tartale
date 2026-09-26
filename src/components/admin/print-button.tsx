'use client';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="pressable rounded-pill bg-chocolate px-5 py-2.5 font-semibold text-ink-inverse">
      Imprimir
    </button>
  );
}
