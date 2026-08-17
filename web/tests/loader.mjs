/* Import hooks for running the domain layer under `node --test`.

   Two jobs: append `.ts` to the extensionless relative imports the project
   uses, and stub the Next.js modules that only exist inside a request. The
   stubs are inert — `cookies()` returns an empty jar, which is what an
   unauthenticated call sees, and nothing under test reads a cookie. */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as join } from 'node:path';

const STUBS = {
  'next/headers': 'data:text/javascript,export const cookies = async () => ({ get: () => undefined });',
  'server-only': 'data:text/javascript,',
};

export function resolve(specifier, context, next) {
  if (STUBS[specifier]) return next(STUBS[specifier], context);
  if (specifier.startsWith('@/')) {
    const root = new URL('../', import.meta.url);
    return resolve('./' + specifier.slice(2), { ...context, parentURL: new URL('x', root).href }, next);
  }
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) {
    const base = dirname(fileURLToPath(context.parentURL));
    for (const ext of ['.ts', '/index.ts']) {
      const p = join(base, specifier + ext);
      if (existsSync(p)) return next(pathToFileURL(p).href, context);
    }
  }
  return next(specifier, context);
}

/* The domain layer imports `villas.json` the way a bundler allows. Node needs
   an explicit `with { type: 'json' }`, so it is supplied here rather than
   changed in the app — the app's import is correct for how it ships. */
export async function load(url, context, next) {
  if (url.endsWith('.json')) {
    const attrs = { ...(context.importAttributes || context.importAssertions), type: 'json' };
    return next(url, { ...context, importAttributes: attrs, importAssertions: attrs });
  }
  return next(url, context);
}
