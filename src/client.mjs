// GramJS client helpers: build a client from env + saved session.
import fs from 'node:fs';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { loadEnv, sessionPath } from './env.mjs';
import { deaccent } from './format.mjs';

export function apiCreds({ interactive = false } = {}) {
  loadEnv();
  const apiId = Number(process.env.TG_API_ID || 0);
  const apiHash = process.env.TG_API_HASH || '';
  if (!interactive && (!apiId || !apiHash)) {
    throw new Error('Missing TG_API_ID / TG_API_HASH. Copy .env.example -> .env and fill them (from https://my.telegram.org).');
  }
  return { apiId, apiHash };
}

export function readSession() {
  if (process.env.TG_SESSION) return process.env.TG_SESSION;
  const p = sessionPath();
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  return '';
}

export function newClient(session = '') {
  const { apiId, apiHash } = apiCreds();
  return new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false,
  });
}

// Connect using the saved session (throws a friendly error if not logged in).
export async function connectExisting() {
  const session = readSession();
  if (!session) throw new Error('No session found. Run `npm run login` first.');
  const client = newClient(session);
  await client.connect();
  if (!(await client.checkAuthorization())) throw new Error('Session is not authorized. Run `npm run login`.');
  return client;
}

// Resolve a chat by @username, phone, numeric id, or (fuzzy) title from dialogs.
export async function resolveEntity(client, query) {
  const q = String(query).trim();
  if (!q) throw new Error('empty chat query');

  // Self: Saved Messages, the safest place to send a test.
  if (/^(me|self)$/i.test(q)) return await client.getEntity('me');

  // @username or phone -> direct entity lookup
  if (q.startsWith('@') || /^\+\d[\d\s-]*$/.test(q)) {
    return await client.getEntity(q);
  }

  // Title match first (accent-insensitive) so numeric-titled chats (e.g. "4096") work.
  const dialogs = await client.getDialogs({ limit: 200 });
  const titleOf = (d) => d.title || d.name || '';
  const exact = dialogs.find(d => deaccent(titleOf(d)) === deaccent(q));
  const partial = dialogs.find(d => deaccent(titleOf(d)).includes(deaccent(q)));
  const hit = exact || partial;
  if (hit) return hit.entity;

  // Fall back to a numeric id only if no title matched
  if (/^-?\d+$/.test(q)) return await client.getEntity(q);

  throw new Error(`chat not found: "${q}"`);
}

export async function withClient(fn) {
  const client = await connectExisting();
  try { return await fn(client); } finally { await client.disconnect(); }
}
