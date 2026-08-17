/* Registers the import hooks in loader.mjs. `--import` runs this before the
   test files load, which is what lets the hooks apply to them too. */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./loader.mjs', pathToFileURL('./tests/'));
