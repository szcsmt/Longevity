#!/usr/bin/env node
/* Turn a password into the scrypt hash that CRM_USERS / CRM_PASSWORD accept.

   Usage:
     node scripts/crm-hash.mjs 'the password'
     node scripts/crm-hash.mjs            # prompts, so it stays out of the shell history

   Paste the output in place of the password:
     CRM_USERS="Jani:scrypt$ab12…$cd34…:admin"

   Nothing else changes — the account signs in with the same password it
   always did. What changes is that reading the environment no longer tells
   anyone what that password is. */
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const KEY_LEN = 32;

function hash(password) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, KEY_LEN).toString('hex')}`;
}

let password = process.argv[2];
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Password: ');
  rl.close();
}
if (!password) {
  console.error('No password given.');
  process.exit(1);
}
console.log(hash(password));
