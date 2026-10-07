import { NextResponse } from 'next/server';

import { getCustomerSession, hasCustomerCookie } from '@/server/auth/customer-session';
import { BodyTooLargeError, readBodyText } from '@/server/http/body';
import { getClientIp, isSameOrigin } from '@/server/security/request';
import { placeOrder, type PlaceOrderFailure } from '@/server/services/order-service';
import { fieldErrors } from '@/server/validation/field-errors';
import { orderInputSchema } from '@/server/validation/schemas';

export const dynamic = 'force-dynamic';

/**
 * The cake's photo (1 MB at most) and the document for the box (2 MB) are 4 MB
 * as base64, and they are most of this. Under Vercel's 4.5 MB limit for a
 * request body, so ours is the one that answers.
 */
const MAX_BODY_BYTES = 4_200_000;

const REASONS: Record<PlaceOrderFailure, { status: number; message: string }> = {
  rate_limited: { status: 429, message: 'Demasiados pedidos desde esta conexión. Prueba en unos minutos.' },
  rejected: { status: 400, message: 'No hemos podido procesar el pedido. Revisa los datos e inténtalo otra vez.' },
  closed: { status: 409, message: 'Ahora mismo no estamos aceptando pedidos. Vuelve a intentarlo más adelante.' },
  payments_off: { status: 503, message: 'Los pagos todavía no están activados. Vuelve a intentarlo más adelante.' },
  zone: { status: 400, message: 'Todavía no llevamos tartas a ese código postal.' },
  cake: { status: 400, message: 'Esa tarta ya no está disponible. Elige otra.' },
  size: { status: 400, message: 'Esa tarta no se hace en ese tamaño. Elige otro.' },
  no_photo: { status: 400, message: 'La pastelería de esa zona no imprime fotos. Quita la foto para seguir.' },
  photo: { status: 400, message: 'No hemos podido leer la foto. Prueba con otra (JPG o PNG).' },
  document: { status: 400, message: 'No hemos podido leer el documento. Tiene que ser un PDF, JPG o PNG de hasta 2 MB.' },
  invalid: { status: 400, message: 'Elige el día de la entrega.' },
  too_soon: { status: 400, message: 'Necesitamos un poco más de antelación: elige otro día.' },
  too_far: { status: 400, message: 'Ese día está demasiado lejos. Elige uno más cercano.' },
  closed_day: { status: 400, message: 'Ese día no repartimos. Elige otro.' },
  payment_unavailable: { status: 502, message: 'No hemos podido abrir la página de pago. Inténtalo otra vez en un momento.' },
};

export async function POST(request: Request): Promise<NextResponse> {
  const noStore = { 'cache-control': 'no-store' };
  if (!(await isSameOrigin())) return NextResponse.json({ message: 'Petición rechazada.' }, { status: 403, headers: noStore });

  let payload: unknown;
  try {
    payload = JSON.parse(await readBodyText(request, MAX_BODY_BYTES));
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json(
        { message: 'Entre la foto y el documento pesan demasiado: el documento, como mucho 2 MB.', fields: { document: 'Demasiado grande' } },
        { status: 413, headers: noStore },
      );
    }
    return NextResponse.json({ message: 'Petición rechazada.' }, { status: 400, headers: noStore });
  }

  const parsed = orderInputSchema.safeParse(payload);
  if (!parsed.success) {
    const { fields, formMessage } = fieldErrors(parsed.error);
    return NextResponse.json({ message: formMessage ?? 'Revisa los datos marcados.', fields }, { status: 400, headers: noStore });
  }

  // Signed in: the order goes in the account, and its details are kept for the next one.
  const customer = (await hasCustomerCookie()) ? await getCustomerSession() : null;
  const result = await placeOrder(parsed.data, await getClientIp(), { customerId: customer?.customer.id ?? null });
  if (!result.ok) {
    const reason = REASONS[result.reason] ?? REASONS.rejected;
    return NextResponse.json(
      { message: reason.message, fields: result.field ? { [result.field]: reason.message } : undefined },
      { status: reason.status, headers: result.reason === 'rate_limited' ? { ...noStore, 'retry-after': '600' } : noStore },
    );
  }
  return NextResponse.json({ ok: true, redirect: result.paymentUrl, tracking: `/pedido/${result.publicId}` }, { status: 201, headers: noStore });
}
