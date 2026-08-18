import type { MetadataRoute } from 'next';

const SITE = 'https://longevitysamui.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Conversion-tracking landing pages, internal previews, the private CRM,
      // the partner portal and API endpoints shouldn't be crawled or indexed.
      // The portal is a door for people who were given a key, not a page
      // anybody should arrive at from a search.
      disallow: ['/thank-you/', '/preview', '/admin', '/portal', '/api/'],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
