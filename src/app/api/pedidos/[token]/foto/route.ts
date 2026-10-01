import { NextResponse } from 'next/server';

import { isPublicId } from '@/server/http/body';
import { findOrderByPublicId, getOrderPhoto } from '@/server/repositories/orders';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { getClientIp } from '@/server/security/request';

export const dynamic = 'force-dynamic';

/**
 * The photo for the cake, for the tracking page and the panel. The order's
 * link is the key; the type was checked from the file's bytes when it was
 * saved. `?descargar` serves the file itself, for the edible printer.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!isPublicId(token)) return new NextResponse(null, { status: 404 });
  if (!(await consume(RULES.tracking, hashIp(await getClientIp()) ?? ANONYMOUS_BUCKET)).allowed) {
    return new NextResponse(null, { status: 429 });
  }
  const order = await findOrderByPublicId(token);
  if (!order || order.erased || !order.hasPhoto) return new NextResponse(null, { status: 404 });
  const photo = await getOrderPhoto(order.id);
  if (!photo) return new NextResponse(null, { status: 404 });

  const download = new URL(request.url).searchParams.has('descargar');
  const extension = photo.mime.split('/')[1] === 'jpeg' ? 'jpg' : photo.mime.split('/')[1];
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      'content-type': photo.mime,
      'cache-control': 'private, max-age=300',
      'content-security-policy': "default-src 'none'",
      'content-disposition': download ? `attachment; filename="tartame-pedido-${order.id}.${extension}"` : 'inline',
    },
  });
}
