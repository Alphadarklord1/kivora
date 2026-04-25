import type { MetadataRoute } from 'next';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kivora.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/account',
        '/analytics',
        '/library',
        '/settings',
        '/sharing',
        '/workspace',
      ],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
