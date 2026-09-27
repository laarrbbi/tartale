import type { MetadataRoute } from 'next';

import { env } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/enviar', '/zonas', '/condiciones', '/privacidad', '/aviso-legal'].map((path) => ({
    url: `${env.APP_ORIGIN}${path}`,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : 0.5,
  }));
}
