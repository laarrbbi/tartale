import type { NextConfig } from 'next';

/**
 * Headers that never depend on the request. The Content-Security-Policy is
 * not here: it carries a per-request nonce and lives in `src/proxy.ts`.
 */
const securityHeaders = [
  // Stop MIME sniffing turning an uploaded photo into something executable.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Legacy clickjacking defence; modern browsers use CSP `frame-ancestors`.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Deny every powerful feature. Choosing a photo is a file input, which
  // needs none of these.
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'display-capture=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
    ].join(', '),
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
  // Two years, subdomains included. Only meaningful over HTTPS.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

/**
 * Pages that belong to one person (or to the team) and must never be indexed.
 * Caching needs no header here: these routes are rendered per request, which
 * Next already marks `no-store`, and the API routes set their own.
 */
const privateHeaders = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // `pg` opens sockets and reads the environment at runtime; bundling it
  // breaks its connection-string parsing.
  serverExternalPackages: ['pg'],

  // The first-time setup endpoint reads the schema files at runtime; they are
  // not imported, so the bundler has to be told to ship them.
  outputFileTracingIncludes: {
    '/api/setup': ['./supabase/schema.sql', './supabase/seed.sql'],
  },

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The tracking link is the key to an order, and an invoice's link to
      // the invoice: no index, no referrer.
      {
        source: '/pedido/:path*',
        headers: [...privateHeaders, { key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/factura/:path*',
        headers: [...privateHeaders, { key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      { source: '/admin/:path*', headers: privateHeaders },
      // A customer's account, and the way in to it.
      { source: '/cuenta', headers: privateHeaders },
      { source: '/entrar', headers: privateHeaders },
      { source: '/api/:path*', headers: privateHeaders },
      {
        // Cake photos change perhaps once a season.
        source: '/cakes/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
      },
    ];
  },
};

export default nextConfig;
