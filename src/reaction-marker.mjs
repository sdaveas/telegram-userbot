// Reaction-marker listener: when YOU add a marker reaction (default ✍️) to a
// message, forward that message to a chat of your choice (default: your own
// Saved Messages) so an agent can act on it.
//
// No decisions are made here on purpose - the reaction is the intent, and the
// agent on the other end decides what to do with it.
//
// Exposed as attachMarker(client) so the MCP process can share one MTProto
// client instead of opening a second session (one session = one process).
import fs from 'node:fs';
import path from 'node:path';
import { Api } from 'telegram';
import { Raw } from 'telegram/events/index.js';
import { resolveEntity } from './client.mjs';
import { chatName, entityName, textOf } from './format.mjs';

const MARKER = process.env.REACTION_EMOJI || '✍️';
const NOTIFY_CHAT = process.env.NOTIFY_CHAT || 'me';
const SELF_NAME = process.env.SELF_NAME || 'me';
// Optional regex: when set, only marker reactions on matching message text notify.
const FILTER = process.env.MARKER_FILTER ? new RegExp(process.env.MARKER_FILTER, 'i') : null;
const TEMPLATE = process.env.MARKER_MESSAGE ||
  'Marker reaction on a Telegram message.\nChat: {chat}\nFrom: {sender}\nText: "{text}"\n(msgId={msgId})';

const norm = (s) => (s || '').replace(/\uFE0F/g, '');
const log = (...a) => console.log(new Date().toISOString(), ...a);

// Dedup: a message edit re-delivers the same reaction, which would otherwise
// notify twice for the same marker.
const SEEN_FILE = process.env.SEEN_FILE || path.join(process.cwd(), 'tg-marker-seen.json');
const seen = new Set((() => { try { return JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')); } catch { return []; } })());
const persistSeen = () => {
  if (seen.size > 5000) { for (const k of [...seen].slice(0, 2000)) seen.delete(k); }
  try { fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen])); } catch {}
};

const render = (vars) => TEMPLATE.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));

export function attachMarker(client) {
  let peer = null;

  async function notify(vars) {
    try {
      if (!peer) {
        peer = await client.getInputEntity(await resolveEntity(client, NOTIFY_CHAT));
      }
      await client.sendMessage(peer, { message: render(vars) });
      log('sent marker notification');
    } catch (e) { peer = null; log('notify error', e.message); }
  }

  const chosenMarker = (reactions) =>
    reactions?.results?.some((r) => norm(r.reaction?.emoticon) === norm(MARKER) && r.chosenOrder != null);

  client.addEventHandler(async (update) => {
    try {
      if (process.env.DEBUG) log('[u]', update?.className);
      let reactions = update.reactions, peerRef = update.peer, msgId = update.msgId, cached = null;
      if (!reactions && update.message) {
        cached = update.message;
        reactions = cached.reactions; peerRef = cached.peerId; msgId = cached.id;
      }
      if (!chosenMarker(reactions)) return;

      let m = cached;
      if (!m || !m.chat) {
        try { m = (await client.getMessages((m && m.peerId) || peerRef, { ids: msgId }))?.[0] || m; } catch {}
      }
      if (!m) return;

      const chat = chatName(m) || entityName(m.chat) || '';
      const sender = m.out ? SELF_NAME : entityName(m.sender);
      const text = textOf(m);
      log(`[marker] ${MARKER} | ${chat} | ${sender} | ${text} | msgId=${m.id}`);

      const key = `${chat}|${m.id}|${MARKER}`;
      if (seen.has(key)) { log('skip (already processed)'); return; }
      seen.add(key); persistSeen();

      if (FILTER && !FILTER.test(text)) { log('skip (MARKER_FILTER did not match)'); return; }
      await notify({ chat, sender, text, msgId: m.id });
    } catch (e) { log('[err]', e?.message || e); }
  }, new Raw({ types: [Api.UpdateMessageReactions, Api.UpdateEditMessage, Api.UpdateNewMessage] }));

  log(`[init] marker "${MARKER}" -> notify "${NOTIFY_CHAT}"${FILTER ? ` (filter: ${FILTER})` : ''}`);
}
