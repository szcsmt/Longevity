import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /* A standalone CommonJS preview script, run by hand to look at the customer
       letters. It is not part of the application and never reaches the browser,
       so the app's module rules do not apply to it — and rewriting it as ESM to
       satisfy a linter it has no business being measured by would be work in
       the wrong direction. */
    "scripts/letters-preview.cjs",
  ]),
]);

export default eslintConfig;
