import type { MetadataRoute } from 'next';

import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/pedido', '/api'] }],
    sitemap: `${env.APP_ORIGIN}/sitemap.xml`,
  };
}
