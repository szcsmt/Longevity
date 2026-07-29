import type { MetadataRoute } from 'next';

const SITE = 'https://longevitysamui.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE,               lastModified: now, changeFrequency: 'weekly',  priority: 1 },
    { url: `${SITE}/imprint`,  lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${SITE}/privacy`,  lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${SITE}/cookies`,  lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${SITE}/partners`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
