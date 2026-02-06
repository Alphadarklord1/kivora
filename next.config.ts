import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable HTTPS in development
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Turbopack configuration for Next.js 16+
  turbopack: {
    resolveAlias: {
      // Stub out Node.js modules for browser-only packages
      fs: { browser: './lib/stubs/fs.ts' },
      path: { browser: './lib/stubs/path.ts' },
    },
  },
};

export default nextConfig;
