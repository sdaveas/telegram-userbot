#!/usr/bin/env node
// Event-driven Telegram watcher (real-time, MTProto - no polling, no browser).
//   npm start            # prints new messages as they arrive
//   EXCLUDE="Work,News" npm start
import { NewMessage } from 'telegram/events/index.js';
import { connectExisting } from './client.mjs';
import { excluded } from './env.mjs';
import { chatName, entityName, textOf } from './format.mjs';

const EXCLUDE = excluded();
const client = await connectExisting();

function log(line) {
  console.log(new Date().toISOString() + ' ' + line);
}

client.addEventHandler(async (event) => {
  const msg = event.message;
  if (!msg) return;
  const chat = chatName(msg);
  if (EXCLUDE.has(chat)) return;
  const who = msg.out ? 'ME' : (msg.isGroup || msg.isChannel ? entityName(msg.sender) : chat);
  log(`[msg] ${chat}${who && who !== chat ? ' | ' + who : ''} | ${textOf(msg)}`);
}, new NewMessage({}));

log(`[init] listening...${EXCLUDE.size ? ` exclude=[${[...EXCLUDE].join(',')}]` : ''}`);

const bye = async () => { log('[stop]'); try { await client.disconnect(); } catch {} process.exit(0); };
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
