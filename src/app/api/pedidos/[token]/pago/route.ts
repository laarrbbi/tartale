import { NextResponse } from 'next/server';

import { isPublicId } from '@/server/http/body';
import { getClientIp, isSameOrigin } from '@/server/security/request';
import { retryPayment } from '@/server/services/order-service';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, { status: number; message: string }> = {
  rate_limited: { status: 429, message: 'Demasiados intentos. Prueba en unos minutos.' },
  not_found: { status: 404, message: 'Este pedido ya no existe.' },
  already_paid: { status: 409, message: 'Este pedido ya está pagado.' },
  cancelled: { status: 409, message: 'Este pedido está cancelado.' },
  payments_off: { status: 503, message: 'Los pagos no están disponibles ahora mismo.' },
  too_soon: { status: 409, message: 'Ya no llegamos a ese día. Haz un pedido nuevo con otra fecha.' },
  too_far: { status: 409, message: 'Ese día está demasiado lejos. Haz un pedido nuevo.' },
  closed_day: { status: 409, message: 'Ese día ya no repartimos. Haz un pedido nuevo con otra fecha.' },
  invalid: { status: 409, message: 'La fecha de este pedido no es válida. Haz un pedido nuevo.' },
  payment_unavailable: { status: 502, message: 'No hemos podido abrir la página de pago. Inténtalo en un momento.' },
};

/** "Pagar ahora" from the tracking page of an unpaid order. */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const noStore = { 'cache-control': 'no-store' };
  if (!(await isSameOrigin())) return NextResponse.json({ message: 'Petición rechazada.' }, { status: 403, headers: noStore });
  const { token } = await params;
  if (!isPublicId(token)) return NextResponse.json({ message: MESSAGES.not_found!.message }, { status: 404, headers: noStore });

  const result = await retryPayment(token, await getClientIp());
  if (!result.ok) {
    const m = MESSAGES[result.reason] ?? MESSAGES.payment_unavailable!;
    return NextResponse.json({ message: m.message }, { status: m.status, headers: noStore });
  }
  return NextResponse.json({ redirect: result.url }, { headers: noStore });
}
