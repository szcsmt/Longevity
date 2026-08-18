import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/* Who may do what.

   The permissions used to live in the call sites: eleven files each asking
   `isAdmin()` and meaning eleven different things by it. That held while "not
   an admin" was the only distinction worth drawing, and stopped holding the
   moment a marketing account existed — what marketing must not SEE is not what
   a salesperson must not DO.

   The table below is the specification. These tests are mostly there to catch
   the two failures nobody notices until it is embarrassing: a role quietly
   gaining a capability when the table is edited, and marketing being able to
   read the money. */

const { ROLES, roleCan } = await import('../lib/crm/auth');

const CAPS = [
  'leads.write', 'leads.reassign', 'leads.merge', 'leads.archive', 'leads.purge',
  'leads.export', 'money.read', 'money.write', 'partners.write',
] as const;

/** The whole matrix, written out so a change to it has to be deliberate. */
const EXPECTED: Record<string, string[]> = {
  admin: [...CAPS],
  head: ['leads.write', 'leads.reassign', 'leads.merge', 'leads.archive', 'leads.export', 'money.read'],
  agent: ['leads.write'],
  finance: ['money.read', 'money.write'],
  marketing: [],
  viewer: ['money.read'],
};

describe('the capability table', () => {
  it('is exactly what it says it is', () => {
    for (const role of Object.keys(EXPECTED)) {
      for (const cap of CAPS) {
        assert.equal(
          roleCan(role as never, cap),
          EXPECTED[role].includes(cap),
          `${role} → ${cap}`,
        );
      }
    }
  });

  it('covers every role that exists', () => {
    assert.deepEqual(ROLES.map((r) => r.id).sort(), Object.keys(EXPECTED).sort());
  });

  it('gives an unknown role nothing at all', () => {
    assert.equal(roleCan(undefined, 'leads.write'), false);
    assert.equal(roleCan('legal' as never, 'money.read'), false);
  });
});

describe('the distinctions worth having', () => {
  it('keeps marketing away from the money, and only marketing', () => {
    /* The whole reason `money.read` exists as a capability rather than an
       `isAdmin()` check: what a campaign produced in buyers is marketing's
       business, and what those buyers are worth is not. */
    assert.equal(roleCan('marketing', 'money.read'), false);
    for (const other of ['admin', 'head', 'finance', 'viewer'] as const) {
      assert.equal(roleCan(other, 'money.read'), true, `${other} reads money`);
    }
  });

  it('keeps finance out of the leads and sales out of the ledger', () => {
    assert.equal(roleCan('finance', 'leads.write'), false);
    assert.equal(roleCan('agent', 'money.write'), false);
    assert.equal(roleCan('head', 'money.write'), false);
  });

  it('leaves the irreversible with the owner alone', () => {
    for (const role of ['head', 'agent', 'finance', 'marketing', 'viewer'] as const) {
      assert.equal(roleCan(role, 'leads.purge'), false, `${role} must not destroy a history`);
      assert.equal(roleCan(role, 'partners.write'), false, `${role} must not write a commission agreement`);
    }
  });

  it('separates archiving from purging, because they are different decisions', () => {
    // Setting a lead aside is reversible and belongs to whoever runs the team.
    assert.equal(roleCan('head', 'leads.archive'), true);
    assert.equal(roleCan('head', 'leads.purge'), false);
  });

  it('separates taking a lead off a colleague from working one', () => {
    assert.equal(roleCan('agent', 'leads.write'), true);
    assert.equal(roleCan('agent', 'leads.reassign'), false);
    assert.equal(roleCan('head', 'leads.reassign'), true);
  });

  it('does not let a salesperson walk out with the list', () => {
    assert.equal(roleCan('agent', 'leads.export'), false);
  });
});

describe('what every role can say about itself', () => {
  it('has a label and a sentence, because a chip nobody understands is noise', () => {
    for (const r of ROLES) {
      assert.ok(r.label.length > 0, `${r.id} needs a label`);
      assert.ok(r.blurb.length > 10, `${r.id} needs a sentence`);
    }
  });
});
