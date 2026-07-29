import type { MetadataRoute } from 'next';

const SITE = 'https://longevitysamui.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Conversion-tracking landing pages, internal previews, the private CRM
      // and API endpoints shouldn't be crawled or indexed.
      disallow: ['/thank-you/', '/preview', '/admin', '/api/'],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
