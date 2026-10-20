// Tests for the MCP tool surface. These exercise makeServer() against a stub
// Telegram client over an in-memory transport, so no session or network is
// needed. Config is read from the environment at import time, so the env vars
// below must be set before the dynamic import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

process.env.SEND_ALLOWLIST = 'Allowed Chat';
process.env.EXCLUDE = 'Ignored Chat';
process.env.SELF_NAME = 'ME';
process.env.TZ_NAME = 'UTC';

const { makeServer } = await import('../src/mcp.mjs');

const EXPECTED_TOOLS = [
  'tg_forward',
  'tg_list_chats',
  'tg_react',
  'tg_reactions',
  'tg_read_chat',
  'tg_read_history',
  'tg_search',
  'tg_send_media',
  'tg_send_message',
  'tg_send_sticker',
  'tg_unread',
];

// A dialogs list exercising the EXCLUDE filter, accent-insensitive search and
// the send allowlist.
const DIALOGS = [
  { title: 'Ignored Chat', id: 1, unreadCount: 0, entity: { title: 'Ignored Chat' }, message: { message: 'noise' } },
  { title: 'Caf\u00E9', id: 2, unreadCount: 0, entity: { title: 'Caf\u00E9' }, message: { message: 'espresso' } },
  { title: 'Allowed Chat', id: 3, unreadCount: 2, entity: { title: 'Allowed Chat' }, message: { message: '  ping\n  me ' } },
  { title: 'Other', id: 4, unreadCount: 0, entity: { title: 'Other' }, message: {} },
];

const MESSAGES = [
  { id: 2, out: true, date: 1700000000, message: 'second' },
  { id: 1, out: false, date: 1699999000, message: 'first', sender: { firstName: 'Mary' } },
];

function stubClient(overrides = {}) {
  return {
    getDialogs: async () => DIALOGS,
    getMessages: async () => MESSAGES,
    getEntity: async (e) => (typeof e === 'object' ? { firstName: 'Bob' } : { id: e, firstName: 'Bob' }),
    getInputEntity: async (e) => e,
    sendMessage: async () => ({}),
    sendFile: async () => ({}),
    forwardMessages: async () => ({}),
    invoke: async () => ({}),
    ...overrides,
  };
}

async function connected(client) {
  const server = makeServer(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  return mcp;
}

const payload = (res) => JSON.parse(res.content[0].text);

test('registers exactly the documented tool set', async () => {
  const mcp = await connected(stubClient());
  const { tools } = await mcp.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), EXPECTED_TOOLS);
  for (const t of tools) {
    assert.ok(t.description, `${t.name} has a description`);
    assert.equal(typeof t.inputSchema, 'object', `${t.name} has an input schema`);
  }
});

test('tg_list_chats drops EXCLUDE titles and shapes the rows', async () => {
  const mcp = await connected(stubClient());
  const rows = payload(await mcp.callTool({ name: 'tg_list_chats', arguments: {} }));
  assert.deepEqual(rows.map((r) => r.title), ['Caf\u00E9', 'Allowed Chat', 'Other']);
  assert.deepEqual(rows[1], { title: 'Allowed Chat', id: '3', unread: 2, preview: 'ping me' });
});

test('tg_unread keeps only dialogs with unread messages', async () => {
  const mcp = await connected(stubClient());
  const rows = payload(await mcp.callTool({ name: 'tg_unread', arguments: {} }));
  assert.deepEqual(rows.map((r) => r.title), ['Allowed Chat']);
});

test('tg_search is accent- and case-insensitive', async () => {
  const mcp = await connected(stubClient());
  const rows = payload(await mcp.callTool({ name: 'tg_search', arguments: { query: 'CAFE' } }));
  assert.deepEqual(rows.map((r) => r.title), ['Caf\u00E9']);
});

test('tg_read_chat reverses to oldest-first and labels the author', async () => {
  const mcp = await connected(stubClient());
  const out = payload(await mcp.callTool({ name: 'tg_read_chat', arguments: { chat: 'Allowed Chat' } }));
  assert.equal(out.chat, 'Allowed Chat');
  assert.deepEqual(out.messages.map((m) => m.id), [1, 2]);
  assert.deepEqual(out.messages[0], {
    id: 1, out: false, from: 'Mary', date: '2023-11-14', time: '21:56', ts: 1699999000, text: 'first',
  });
  assert.equal(out.messages[1].from, 'ME');
});

test('tg_send_message refuses a chat outside SEND_ALLOWLIST', async () => {
  let sent = 0;
  const mcp = await connected(stubClient({ sendMessage: async () => { sent++; } }));
  const res = await mcp.callTool({ name: 'tg_send_message', arguments: { chat: 'Caf\u00E9', text: 'hi' } });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /blocked by SEND_ALLOWLIST/);
  assert.equal(sent, 0);
});

test('tg_send_message sends to an allowed chat', async () => {
  const calls = [];
  const mcp = await connected(stubClient({ sendMessage: async (entity, opts) => { calls.push([entity, opts]); } }));
  const res = payload(await mcp.callTool({ name: 'tg_send_message', arguments: { chat: 'Allowed Chat', text: 'hi' } }));
  assert.deepEqual(res, { chat: 'Allowed Chat', sent: 'hi' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].message, 'hi');
});

test('tg_send_media requires exactly one of url/path', async () => {
  const mcp = await connected(stubClient());
  const neither = await mcp.callTool({ name: 'tg_send_media', arguments: { chat: 'Allowed Chat' } });
  assert.equal(neither.isError, true);
  assert.match(neither.content[0].text, /url or path is required/);
  const both = await mcp.callTool({ name: 'tg_send_media', arguments: { chat: 'Allowed Chat', url: 'http://x/y.jpg', path: '/tmp/y.jpg' } });
  assert.equal(both.isError, true);
  assert.match(both.content[0].text, /not both/);
});

test('tg_react defaults to the marker emoji', async () => {
  const invoked = [];
  const mcp = await connected(stubClient({ invoke: async (req) => { invoked.push(req); } }));
  const out = payload(await mcp.callTool({ name: 'tg_react', arguments: { chat: 'Allowed Chat', msgId: 7 } }));
  assert.deepEqual(out, { chat: 'Allowed Chat', msgId: 7, reacted: '\u270D\uFE0F' });
  assert.equal(invoked.length, 1);
  assert.equal(invoked[0].className, 'messages.SendReaction');
  assert.equal(invoked[0].reaction[0].emoticon, '\u270D\uFE0F');
});

test('tg_react with remove clears the reaction', async () => {
  const invoked = [];
  const mcp = await connected(stubClient({ invoke: async (req) => { invoked.push(req); } }));
  const out = payload(await mcp.callTool({ name: 'tg_react', arguments: { chat: 'Allowed Chat', msgId: 7, remove: true } }));
  assert.equal(out.reacted, null);
  assert.deepEqual(invoked[0].reaction, []);
});

test('tg_reactions resolves who reacted when asked', async () => {
  const messages = [{
    id: 9,
    out: false,
    date: 1700000000,
    message: 'vote',
    reactions: { results: [{ reaction: { emoticon: '\uD83D\uDC4D' }, count: 1, chosenOrder: 0 }] },
  }];
  const invoke = async (req) => {
    if (req.className === 'messages.GetMessageReactionsList') {
      return { reactions: [{ peerId: { className: 'PeerUser', userId: 5 }, reaction: { emoticon: '\uD83D\uDC4D' } }] };
    }
    return {};
  };
  const mcp = await connected(stubClient({ getMessages: async () => messages, invoke }));
  const out = payload(await mcp.callTool({ name: 'tg_reactions', arguments: { chat: 'Allowed Chat', reactors: true } }));
  assert.equal(out.count, 1);
  assert.deepEqual(out.messages[0].reactions, [{ emoji: '\uD83D\uDC4D', count: 1, mine: true }]);
  assert.deepEqual(out.messages[0].who, [{ name: 'Bob', emoji: '\uD83D\uDC4D' }]);
});

test('tg_forward reports both ends', async () => {
  const mcp = await connected(stubClient());
  const out = payload(await mcp.callTool({ name: 'tg_forward', arguments: { chat: 'Allowed Chat', from: 'Caf\u00E9', msgId: 12 } }));
  assert.deepEqual(out, { from: 'Caf\u00E9', to: 'Allowed Chat', msgId: 12 });
});
