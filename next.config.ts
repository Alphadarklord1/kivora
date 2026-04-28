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
      "style-src 'self' 'unsafe-inline' https://fonts.bunny.net",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https: ws: wss: http://127.0.0.1:* http://localhost:*",
      "media-src 'self' blob: data:",
      "worker-src 'self' blob:",
      // PDF previews and other in-app file viewers render as <iframe src="blob:…">.
      // Without frame-src/object-src, the directive falls back to default-src
      // ('self') and the browser blocks the blob: URL with an empty placeholder.
      "frame-src 'self' blob: data:",
      "object-src 'self' blob: data:",
    ].join('; '),
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Force HTTPS for two years and apply to subdomains. Submitting to the
  // browser preload list (hstspreload.org) is a separate manual step.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
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
