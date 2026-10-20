#!/usr/bin/env node
// MCP server exposing a Telegram account (MTProto / GramJS) as tools: list and
// read chats, search, send messages/media/stickers, react, forward.
//
//   MCP_HTTP_PORT=8790 node src/mcp.mjs    # streamable HTTP at /mcp
//   node src/mcp.mjs                       # stdio
//
// This server is transport only: it makes no decisions of its own. Anything
// that needs judgement (what to send, what a message means) belongs to the
// agent on the other end. See README.md for the environment variables.
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;   // Node 18 polyfill for the MCP SDK

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { Api } from 'telegram';
import { list, loadEnv } from './env.mjs';
import { connectExisting, resolveEntity } from './client.mjs';
import { chatName, deaccent, entityName, textOf } from './format.mjs';

loadEnv();

const EXCLUDE = new Set(list('EXCLUDE'));
const allowlist = new Set(list('SEND_ALLOWLIST'));
const SELF_NAME = process.env.SELF_NAME || 'ME';
const TZ = process.env.TZ_NAME || Intl.DateTimeFormat().resolvedOptions().timeZone;

const log = (...a) => process.stderr.write('[telegram-userbot] ' + a.join(' ') + '\n');
const json = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 2) }] });
const fail = (m) => ({ isError: true, content: [{ type: 'text', text: String(m) }] });

const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });   // YYYY-MM-DD
const clock = (unix) => (unix ? timeFmt.format(new Date(unix * 1000)) : '');
const day = (unix) => (unix ? dayFmt.format(new Date(unix * 1000)) : '');

async function dialogs(client, limit = 30) {
  const ds = await client.getDialogs({ limit });
  return ds.map((d) => ({
    title: d.title || d.name || entityName(d.entity) || '',
    id: String(d.id),
    unread: d.unreadCount || 0,
    preview: (d.message?.message || '').replace(/\s+/g, ' ').trim().slice(0, 120),
  })).filter((d) => !EXCLUDE.has(d.title));
}

async function readChat(client, chat, limit = 20, before) {
  const entity = chat ? await resolveEntity(client, chat) : null;
  const peer = entity ? await client.getInputEntity(entity) : undefined;
  const msgs = await client.getMessages(peer, before ? { limit, offsetId: before } : { limit });
  return {
    chat: entity ? entityName(entity) : '(current)',
    messages: msgs.map((m) => ({
      id: m.id,
      out: !!m.out,
      from: m.out ? SELF_NAME : (entityName(m.sender) || chatName(m)),
      date: day(m.date),
      time: clock(m.date),
      ts: m.date || null,
      text: textOf(m, { collapse: false }),
    })).reverse(),
  };
}

// Reaction helpers. Telegram stores a reaction result as (emoji, count); the
// list of WHO reacted is a separate call, which is why it is opt-in.
const emojiOf = (r) => r?.emoticon || (r?.documentId ? '[custom]' : null);

const nameCache = new Map();
async function nameOf(client, peerId) {
  if (!peerId) return '(unknown)';
  const key = peerId.className + ':' + (peerId.userId ?? peerId.channelId ?? peerId.chatId);
  if (nameCache.has(key)) return nameCache.get(key);
  let name = key;
  try {
    const e = await client.getEntity(peerId);
    name = e?.title || entityName(e) || e?.username || key;
  } catch {}
  nameCache.set(key, name);
  return name;
}

async function reactorsOf(client, peer, msgId, reaction) {
  const out = [];
  let offset = '';
  for (let guard = 0; guard < 20; guard++) {
    let res;
    try {
      res = await client.invoke(new Api.messages.GetMessageReactionsList({
        peer, id: msgId, reaction, limit: 100, offset,
      }));
    } catch (e) { log('reaction list failed', msgId, e?.message || e); break; }
    for (const r of (res.reactions || [])) out.push({ name: await nameOf(client, r.peerId), emoji: emojiOf(r.reaction) });
    offset = res.nextOffset || '';
    if (!offset || !(res.reactions || []).length) break;
  }
  return out;
}

export function makeServer(client) {
  const server = new McpServer({ name: 'telegram-userbot', version: '0.1.0' });

  server.registerTool('tg_list_chats', {
    title: 'List Telegram chats',
    description: 'List dialogs (title, unread count, last-message preview).',
    inputSchema: { limit: z.number().int().min(1).max(200).optional() },
  }, async ({ limit }) => json(await dialogs(client, limit ?? 30)));

  server.registerTool('tg_unread', {
    title: 'List chats with unread messages',
    description: 'Return only dialogs with unread messages.',
    inputSchema: {},
  }, async () => json((await dialogs(client, 200)).filter((d) => d.unread)));

  server.registerTool('tg_read_chat', {
    title: 'Read a chat',
    description: 'Return the most recent messages of a chat (by title/username/id).',
    inputSchema: {
      chat: z.string().describe('chat title/username/id'),
      limit: z.number().int().min(1).max(200).optional(),
      before: z.number().int().optional().describe('return messages older than this message id (paging)'),
    },
  }, async ({ chat, limit, before }) => json(await readChat(client, chat, limit ?? 20, before)));

  server.registerTool('tg_read_history', {
    title: 'Read chat history',
    description: 'Fetch a larger slice of a chat history (MTProto - full history, no scrolling).',
    inputSchema: {
      chat: z.string(),
      limit: z.number().int().min(1).max(500).optional(),
      before: z.number().int().optional().describe('return messages older than this message id (paging)'),
    },
  }, async ({ chat, limit, before }) => json(await readChat(client, chat, limit ?? 200, before)));

  server.registerTool('tg_search', {
    title: 'Search chats by name',
    description: 'Filter your dialogs by a substring of the title (accent-insensitive).',
    inputSchema: { query: z.string().min(1) },
  }, async ({ query }) => {
    const q = deaccent(query);
    return json((await dialogs(client, 200)).filter((d) => deaccent(d.title).includes(q)));
  });

  server.registerTool('tg_send_message', {
    title: 'Send a Telegram message as the user',
    description: 'Send a text message from the logged-in account.',
    inputSchema: { chat: z.string(), text: z.string().min(1) },
  }, async ({ chat, text }) => {
    const entity = await resolveEntity(client, chat);
    const title = entityName(entity);
    if (allowlist.size && ![...allowlist].some((a) => deaccent(a) === deaccent(title))) {
      return fail(`blocked by SEND_ALLOWLIST: "${title}" not in [${[...allowlist].join(', ')}]`);
    }
    await client.sendMessage(entity, { message: text });
    return json({ chat: title, sent: text });
  });

  server.registerTool('tg_reactions', {
    title: 'Read reactions on recent messages',
    description: 'Messages of a chat that carry reactions: emoji, count, and which one is yours. Set reactors=true to also resolve WHO reacted (one extra call per message, slow over long ranges).',
    inputSchema: {
      chat: z.string(),
      limit: z.number().int().min(1).max(200).optional(),
      before: z.number().int().optional().describe('return messages older than this message id (paging)'),
      reactors: z.boolean().optional().describe('include who reacted, with what'),
    },
  }, async ({ chat, limit, before, reactors }) => {
    const entity = await resolveEntity(client, chat);
    const peer = await client.getInputEntity(entity);
    const msgs = await client.getMessages(peer, before ? { limit: limit ?? 50, offsetId: before } : { limit: limit ?? 50 });
    const withR = [];
    for (const m of msgs) {
      if (!m.reactions) continue;
      const results = m.reactions.results || [];
      const entry = {
        id: m.id,
        out: !!m.out,
        text: textOf(m, { collapse: false }),
        reactions: results.map((r) => ({ emoji: emojiOf(r.reaction), count: r.count, mine: r.chosenOrder != null })),
      };
      if (reactors) {
        entry.who = [];
        for (const r of results) entry.who.push(...await reactorsOf(client, peer, m.id, r.reaction));
      }
      withR.push(entry);
    }
    return json({ chat: entityName(entity), count: withR.length, messages: withR });
  });

  server.registerTool('tg_react', {
    title: 'React to a Telegram message as the user',
    description: 'Add or clear a reaction on a specific message (chat + msgId). Default emoji ✍️.',
    inputSchema: {
      chat: z.string().describe('chat title/username/id'),
      msgId: z.number().int().describe('message id to react to'),
      emoji: z.string().optional().describe('emoji to react with (default ✍️)'),
      remove: z.boolean().optional().describe('clear the reaction instead'),
    },
  }, async ({ chat, msgId, emoji, remove }) => {
    const entity = await resolveEntity(client, chat);
    const peer = await client.getInputEntity(entity);
    const reaction = (remove || emoji === '') ? [] : [new Api.ReactionEmoji({ emoticon: emoji || '✍️' })];
    await client.invoke(new Api.messages.SendReaction({ peer, msgId, reaction }));
    return json({ chat: entityName(entity), msgId, reacted: reaction[0]?.emoticon || null });
  });

  server.registerTool('tg_send_sticker', {
    title: 'Send a sticker as the user',
    description: 'Send a sticker from your installed packs (random; optional emoji to filter).',
    inputSchema: { chat: z.string(), emoji: z.string().optional().describe('filter sticker packs by emoji, e.g. ✍️') },
  }, async ({ chat, emoji }) => {
    let useEmoji = emoji;
    if (!useEmoji) {
      const emoticons = [];
      try {
        const all = await client.invoke(new Api.messages.GetAllStickers({ hash: 0 }));
        for (const s of (all.sets || [])) for (const p of (s.packs || [])) if (p.emoticon) emoticons.push(p.emoticon);
      } catch {}
      const pool = emoticons.length ? emoticons : ['😀', '😂', '❤️', '👍', '🔥', '🎉'];
      useEmoji = pool[Math.floor(Math.random() * pool.length)];
    }
    const r = await client.invoke(new Api.messages.GetStickers({ emoticon: useEmoji, hash: 0 }));
    const docs = r.stickers || r;
    if (!docs || !docs.length) return fail(`no stickers found for ${useEmoji}`);
    const doc = docs[Math.floor(Math.random() * docs.length)];
    const entity = await resolveEntity(client, chat);
    const peer = await client.getInputEntity(entity);
    const media = new Api.InputMediaDocument({
      id: new Api.InputDocument({ id: doc.id, accessHash: doc.accessHash, fileReference: doc.fileReference }),
      message: '',
    });
    await client.invoke(new Api.messages.SendMedia({
      peer, media, message: '', randomId: BigInt('' + Math.floor(Math.random() * 1e15)),
    }));
    return json({ chat: entityName(entity), sticker: String(doc.id), emoji: useEmoji, pool: docs.length });
  });

  server.registerTool('tg_send_media', {
    title: 'Send media from a URL or a local path',
    description: 'Send an image, GIF, video or file, either from a URL (Telegram fetches it) or from a path readable by this process.',
    inputSchema: {
      chat: z.string(),
      url: z.string().optional().describe('direct media URL, fetched by Telegram'),
      path: z.string().optional().describe('local file path, uploaded by this process'),
      kind: z.enum(['gif', 'photo', 'video', 'file']).optional(),
      caption: z.string().optional(),
    },
  }, async ({ chat, url, path: filePath, kind, caption }) => {
    if (!url && !filePath) return fail('either url or path is required');
    if (url && filePath) return fail('pass url or path, not both');
    const entity = await resolveEntity(client, chat);

    // Telegram picks photo-vs-document from the extension of the URL, which
    // breaks for URLs carrying a query string (memegen's ?font=, for one) and
    // GramJS gives no way to override it. For an explicit photo, fetch the bytes
    // ourselves and upload them under a .jpg name.
    if (kind === 'photo' && url) {
      const res = await fetch(url);
      if (!res.ok) return fail(`could not fetch ${url}: HTTP ${res.status}`);
      const tmp = path.join(os.tmpdir(), `tg-send-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
      await fs.promises.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
      try {
        await client.sendFile(entity, caption ? { file: tmp, caption } : { file: tmp });
      } finally {
        await fs.promises.unlink(tmp).catch(() => {});
      }
      return json({ chat: entityName(entity), source: 'url', kind: 'photo' });
    }

    const opts = { file: filePath || url };
    if (caption) opts.caption = caption;
    if (kind === 'gif') {
      opts.forceDocument = true;
      opts.attributes = [new Api.DocumentAttributeAnimated()];
    } else if (kind === 'file') {
      opts.forceDocument = true;
    }
    await client.sendFile(entity, opts);
    return json({ chat: entityName(entity), source: filePath ? 'path' : 'url', kind: kind || 'auto' });
  });

  server.registerTool('tg_forward', {
    title: 'Forward a Telegram message',
    description: 'Forward a message (by id) from one chat to another (works for any media incl. stickers/GIFs).',
    inputSchema: {
      chat: z.string().describe('destination chat'),
      from: z.string().describe('source chat'),
      msgId: z.number().int(),
    },
  }, async ({ chat, from, msgId }) => {
    const toE = await resolveEntity(client, chat);
    const fromE = await resolveEntity(client, from);
    await client.forwardMessages(
      await client.getInputEntity(toE),
      { messages: [msgId], fromPeer: await client.getInputEntity(fromE) },
    );
    return json({ from: entityName(fromE), to: entityName(toE), msgId });
  });

  return server;
}

async function main() {
  const client = await connectExisting();

  if (process.env.START_LISTENER === '1') {
    const { attachMarker } = await import('./reaction-marker.mjs');
    attachMarker(client);
  }

  const bye = async () => { try { await client.disconnect(); } catch {} process.exit(0); };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);

  const HTTP_PORT = Number(process.env.MCP_HTTP_PORT || 0);
  if (HTTP_PORT) {
    const HOST = process.env.MCP_HOST || '127.0.0.1';
    const TOKEN = process.env.MCP_TOKEN;
    if (!TOKEN) log('WARNING: MCP_TOKEN is not set - the HTTP endpoint is unauthenticated');
    http.createServer(async (req, res) => {
      const u = req.url || '';
      if (u.startsWith('/health')) { res.writeHead(200); res.end('ok'); return; }
      if (!u.startsWith('/mcp')) { res.writeHead(404); res.end('not found'); return; }
      if (TOKEN && req.headers['authorization'] !== 'Bearer ' + TOKEN) { res.writeHead(401); res.end('unauthorized'); return; }
      try {
        const server = makeServer(client);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => { transport.close(); server.close(); });
        await server.connect(transport);
        await transport.handleRequest(req, res);
      } catch (e) {
        log('http error', e?.message || e);
        if (!res.headersSent) { res.writeHead(500); res.end(String(e)); }
      }
    }).listen(HTTP_PORT, HOST, () => log(`ready (http :${HTTP_PORT}/mcp, tz ${TZ})`));
  } else {
    await makeServer(client).connect(new StdioServerTransport());
    log(`ready (stdio, tz ${TZ})`);
  }
}

// Only connect (and open a Telegram session) when executed directly; importing
// this module - in tests, for one - must not touch the network.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
