import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable HTTPS in development
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
