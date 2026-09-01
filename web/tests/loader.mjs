/* Import hooks for running the domain layer under `node --test`.

   Two jobs: append `.ts` to the extensionless relative imports the project
   uses, and stub the Next.js modules that only exist inside a request.

   The cookie jar used to be inert — `cookies()` returned nothing, which is
   what an unauthenticated call sees, and nothing under test read a cookie.
   That stopped being true the day the API routes got tested: their whole
   subject is who is signed in, and every one of them asks the jar. So the stub
   now reads `globalThis.__lrCookies`, which a test sets to sign itself in as
   somebody. With nothing set it behaves exactly as before, so the domain tests
   are unaffected — an empty jar is still an anonymous caller. */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as join } from 'node:path';

const STUBS = {
  'next/headers': 'data:text/javascript,' + encodeURIComponent(`
    export const cookies = async () => ({
      get: (name) => {
        const v = globalThis.__lrCookies?.[name];
        return v === undefined ? undefined : { name, value: v };
      },
      set: (name, value) => { (globalThis.__lrCookies ??= {})[name] = value; },
      delete: (name) => { if (globalThis.__lrCookies) delete globalThis.__lrCookies[name]; },
    });
    export const headers = async () => new Headers(globalThis.__lrHeaders || {});
  `),
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
