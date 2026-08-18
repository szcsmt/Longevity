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

## `flows.test.ts`

Every other file here tests one rule. That one tests that the rules add up: a lead
really can travel from a Facebook ad to a signed contract, an agency's introduction
really does survive a duplicate merge, and a salesperson really can leave without
taking a customer's history with them.

Six journeys, written as narratives rather than as unit assertions — if one starts
failing, something a person does every week has stopped working, and the test should
read enough like that week to say which part.

    1  a Facebook ad becomes a signed contract
    2  an agency introduces a buyer, and still gets the credit
    3  a customer comes back through another channel
    4  a salesperson leaves
    5  two salespeople reach for the same villa
    6  the head of sales opens the CRM
