#!/usr/bin/env node
// Interactive one-time login. Saves a StringSession to session.txt.
// Run:  npm run login
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { loadEnv, sessionPath } from './env.mjs';

loadEnv();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let apiId = Number(process.env.TG_API_ID || 0);
let apiHash = process.env.TG_API_HASH || '';

if (!apiId) apiId = Number((await rl.question('TG_API_ID (from https://my.telegram.org): ')).trim());
if (!apiHash) apiHash = (await rl.question('TG_API_HASH: ')).trim();
if (!apiId || !apiHash) { console.error('api_id/api_hash required.'); process.exit(1); }

const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
  connectionRetries: 5,
  useWSS: false,
});

await client.start({
  phoneNumber: async () => (await rl.question('Phone number (+30...): ')).trim(),
  password: async () => (await rl.question('2FA password (blank if none): ')).trim(),
  phoneCode: async () => (await rl.question('Login code from Telegram: ')).trim(),
  onError: (e) => console.error('[login]', e?.message || e),
});

const saved = client.session.save();
const p = sessionPath();
fs.writeFileSync(p, saved, { mode: 0o600 });
console.log(`\nLogged in. Session saved to ${p}`);

// Persist api creds to .env (so watch/send can reuse them) if not already there.
const envPath = process.env.ENV_FILE || '.env';
let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
let changed = false;
const upsert = (key, val) => {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(envText)) envText = envText.replace(re, `${key}=${val}`);
  else envText = (envText.trimEnd() + `\n${key}=${val}\n`).replace(/^\n+/, '');
  changed = true;
};
if (!new RegExp(`^TG_API_ID=.+`, 'm').test(envText)) upsert('TG_API_ID', apiId);
if (!new RegExp(`^TG_API_HASH=.+`, 'm').test(envText)) upsert('TG_API_HASH', apiHash);
if (changed) {
  fs.writeFileSync(envPath, envText.startsWith('#') || envText.includes('\n') ? envText : `# Telegram API creds\n${envText}`, { mode: 0o600 });
  console.log(`   api creds also saved to ${envPath}`);
}
console.log('   (keep session.txt secret - it is your account.)');
await client.disconnect();
rl.close();
process.exit(0);
