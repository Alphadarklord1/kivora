import type { MetadataRoute } from 'next';

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  || 'https://study-alpha-three.vercel.app';

const routes = [
  '',
  '/login',
  '/register',
  '/workspace',
  '/coach',
  '/math',
  '/planner',
  '/library',
  '/sharing',
  '/analytics',
  '/downloads',
  '/privacy',
  '/terms',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return routes.map((route) => ({
    url: `${siteUrl}${route || '/'}`.replace(/\/+$/, route === '' ? '' : '/'),
    lastModified: now,
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : route === '/workspace' || route === '/coach' ? 0.9 : 0.7,
  }));
}
