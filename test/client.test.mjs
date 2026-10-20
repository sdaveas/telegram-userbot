import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEntity } from '../src/client.mjs';

// resolveEntity only touches getDialogs() and getEntity(), so a tiny stub is
// enough - no network, no session.
function stubClient(dialogs = []) {
  const looked = [];
  return {
    looked,
    getDialogs: async () => dialogs,
    getEntity: async (q) => { looked.push(q); return { title: `entity:${q}` }; },
  };
}

test('resolves an exact title, accent- and case-insensitively', async () => {
  const client = stubClient([{ title: 'Z\u00FCrich', entity: { title: 'Z\u00FCrich' } }]);
  assert.equal((await resolveEntity(client, 'zurich')).title, 'Z\u00FCrich');
  assert.equal(client.looked.length, 0);
});

test('resolves a partial title', async () => {
  const client = stubClient([{ title: 'Team Standup', entity: { title: 'Team Standup' } }]);
  assert.equal((await resolveEntity(client, 'standup')).title, 'Team Standup');
});

test('prefers an exact match over an earlier partial one', async () => {
  const client = stubClient([
    { title: 'Team Standup', entity: { title: 'Team Standup' } },
    { title: 'Standup', entity: { title: 'Standup' } },
  ]);
  assert.equal((await resolveEntity(client, 'standup')).title, 'Standup');
});

test('a @username goes straight to getEntity', async () => {
  const client = stubClient();
  assert.equal((await resolveEntity(client, '@mary')).title, 'entity:@mary');
  assert.deepEqual(client.looked, ['@mary']);
});

test('me and self resolve to your own account', async () => {
  for (const q of ['me', 'ME', 'self']) {
    const client = stubClient();
    assert.equal((await resolveEntity(client, q)).title, 'entity:me');
    assert.deepEqual(client.looked, ['me']);
  }
});

test('a phone number goes straight to getEntity', async () => {
  const client = stubClient();
  await resolveEntity(client, '+30 690 000 0000');
  assert.deepEqual(client.looked, ['+30 690 000 0000']);
});

test('a numeric id is used only when no title matches', async () => {
  const client = stubClient([{ title: '4096', entity: { title: '4096' } }]);
  assert.equal((await resolveEntity(client, '4096')).title, '4096');
  assert.equal(client.looked.length, 0, 'title match wins over the numeric lookup');

  const bare = stubClient();
  assert.equal((await resolveEntity(bare, '-1001234567890')).title, 'entity:-1001234567890');
});

test('throws on an unknown chat and on an empty query', async () => {
  await assert.rejects(() => resolveEntity(stubClient(), 'nope'), /chat not found/);
  await assert.rejects(() => resolveEntity(stubClient(), '   '), /empty chat query/);
});
