import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https: ws: wss: http://127.0.0.1:* http://localhost:*",
      "media-src 'self' blob: data:",
      "worker-src 'self' blob:",
    ].join('; '),
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  // Enable HTTPS in development
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Turbopack configuration for Next.js 16+
  turbopack: {
    root: __dirname,
    resolveAlias: {
      // Stub out Node.js modules for browser-only packages
      fs: { browser: './lib/stubs/fs.ts' },
      path: { browser: './lib/stubs/path.ts' },
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
