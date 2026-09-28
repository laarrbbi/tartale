import { NextResponse } from 'next/server';
import { z } from 'zod';

import { BodyTooLargeError, isPublicId, readBodyText } from '@/server/http/body';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { getClientIp, isSameOrigin } from '@/server/security/request';
import { requestCompanyInvoice, type InvoiceFailure } from '@/server/services/invoice-service';
import { fieldErrors } from '@/server/validation/field-errors';
import { billingSchema } from '@/server/validation/schemas';

export const dynamic = 'force-dynamic';

/** The fiscal details, and the form's bot checks: a hidden field and the time it took. */
const requestSchema = billingSchema.extend({
  website: z.string().max(200).nullish(),
  elapsedMs: z.coerce.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
});

/** Five fields take a person longer than this. */
const MIN_HUMAN_MS = 3000;

const MESSAGES: Partial<Record<InvoiceFailure, { status: number; message: string }>> = {
  not_found: { status: 404, message: 'Este pedido ya no existe.' },
  not_paid: { status: 409, message: 'La factura se emite cuando el pedido está pagado.' },
  already_complete: { status: 409, message: 'Este pedido ya tiene su factura completa. Si hay algún error en ella, escríbenos.' },
  not_ready: { status: 503, message: 'Ahora mismo no podemos emitirla. Escríbenos y te la hacemos.' },
  nothing_to_invoice: { status: 409, message: 'Se te devolvió todo el importe: no queda nada que facturar.' },
};

/**
 * "La necesito a nombre de mi empresa", from the tracking page. The link is
 * the credential, as for reading the page; the details are parsed like any
 * other input, and the NIF is checked by its control character.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const noStore = { 'cache-control': 'no-store' };
  if (!(await isSameOrigin())) return NextResponse.json({ message: 'Petición rechazada.' }, { status: 403, headers: noStore });
  const { token } = await params;
  if (!isPublicId(token)) return NextResponse.json({ message: MESSAGES.not_found!.message }, { status: 404, headers: noStore });
  if (!(await consume(RULES.invoice, hashIp(await getClientIp()) ?? ANONYMOUS_BUCKET)).allowed) {
    return NextResponse.json(
      { message: 'Demasiados intentos. Prueba en unos minutos.' },
      { status: 429, headers: { ...noStore, 'retry-after': '600' } },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBodyText(request, 4_000));
  } catch (error) {
    const status = error instanceof BodyTooLargeError ? 413 : 400;
    return NextResponse.json({ message: 'Petición rechazada.' }, { status, headers: noStore });
  }
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    const { fields, formMessage } = fieldErrors(parsed.error);
    return NextResponse.json({ message: formMessage ?? 'Revisa los datos marcados.', fields }, { status: 400, headers: noStore });
  }
  const { website, elapsedMs, ...billing } = parsed.data;
  if (website || elapsedMs === undefined || elapsedMs < MIN_HUMAN_MS) {
    return NextResponse.json({ message: 'No hemos podido procesarlo. Inténtalo otra vez.' }, { status: 400, headers: noStore });
  }

  const result = await requestCompanyInvoice(token, billing);
  if (!result.ok) {
    const m = MESSAGES[result.reason] ?? { status: 409, message: 'No hemos podido emitirla. Escríbenos y te la hacemos.' };
    return NextResponse.json({ message: m.message }, { status: m.status, headers: noStore });
  }
  return NextResponse.json(
    result.invoice
      ? { ok: true, number: result.invoice.number, link: `/factura/${result.invoice.publicId}` }
      : { ok: true, number: null, link: null },
    { headers: noStore },
  );
}
