# Tests

Node's built-in runner, no dependencies added. TypeScript is executed directly
by `--experimental-strip-types`, and `loader.mjs` resolves the project's
extensionless relative imports plus the two Next.js modules the domain layer
touches.

    npm test

Each file points `CRM_DATA_DIR` at a fresh temporary directory before importing
anything, so the suite runs against the file backend and never sees, or writes,
real data. The file backend is a deliberate twin of the Postgres one — the
revision guard in particular is implemented identically — so a race proven here
is a race prevented in production.
