'use client';

import { useEffect } from 'react';
import { captureSource } from '@/lib/source';

/* Runs on every page load (mounted in the root layout) so a ?source= / ?utm_source=
   landing is captured into the session immediately — regardless of which page the
   QR code / campaign link points at. Renders nothing. */
export function SourceTracker() {
  useEffect(() => { captureSource(); }, []);
  return null;
}
