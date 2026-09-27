import { getSession } from '@/server/auth/session';
import { findOrderById, getOrderDocument } from '@/server/repositories/orders';

export const dynamic = 'force-dynamic';

/**
 * The document that goes in the box, for the team to print. Signed-in panel
 * accounts only — a CV is someone's personal data, and the tracking link
 * never reaches it. Always a download: a file someone uploaded is never
 * rendered in our origin.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const notFound = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  if (!(await getSession())) return notFound();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return notFound();
  const order = await findOrderById(id);
  if (!order || order.erased || !order.hasDocument) return notFound();
  const doc = await getOrderDocument(order.id);
  if (!doc) return notFound();

  const ascii = doc.filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      'content-type': doc.mime,
      'content-length': String(doc.bytes.length),
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
