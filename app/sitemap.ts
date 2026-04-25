import type { MetadataRoute } from 'next';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kivora.app';

const publicRoutes = [
  '',
  '/downloads',
  '/forgot-password',
  '/login',
  '/register',
  '/report',
  '/reset-password',
  '/shared',
  '/status',
  '/terms',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return publicRoutes.map((route) => ({
    url: `${appUrl}${route}`,
    lastModified: now,
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.6,
  }));
}
