import 'server-only';

export class BodyTooLargeError extends Error {
  constructor() {
    super('Request body too large');
    this.name = 'BodyTooLargeError';
  }
}

/**
 * The request body as text, refusing more than `maxBytes`. Content-Length is
 * checked first, and the stream is counted too: a chunked request carries no
 * length and would otherwise be read whole into memory.
 */
export async function readBodyText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new BodyTooLargeError();
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Public links carry a 22-character token; anything else is not worth a database query. */
export function isPublicId(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(value);
}
