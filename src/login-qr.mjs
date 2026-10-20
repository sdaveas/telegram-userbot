#!/usr/bin/env node
// QR login for the MTProto userbot (headless-friendly).
// Serves an auto-refreshing QR at http://<host>:<PORT>/ so you can scan anytime.
//   npm run login:qr          (PORT=8791)
// Reads TG_API_ID / TG_API_HASH from .env; optional TG_2FA for two-step password.
import fs from 'node:fs';
import http from 'node:http';
import QRCode from 'qrcode';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { loadEnv, sessionPath } from './env.mjs';

loadEnv();
const apiId = Number(process.env.TG_API_ID || 0);
const apiHash = process.env.TG_API_HASH || '';
const PORT = Number(process.env.QR_PORT || 8791);
const BIND = process.env.QR_BIND || '127.0.0.1';
if (!apiId || !apiHash) { console.error('missing TG_API_ID / TG_API_HASH'); process.exit(1); }

let currentUrl = '';      // tg://login?token=...
let png = null;           // cached QR png for currentUrl

async function renderQr() {
  if (!currentUrl) return null;
  try { return await QRCode.toBuffer(currentUrl, { type: 'png', width: 640, margin: 2 }); }
  catch { return null; }
}

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Userbot QR login</title>
<style>body{background:#111;color:#eee;font-family:-apple-system,sans-serif;text-align:center;padding:24px}
img{width:560px;height:560px;background:#fff;border-radius:14px}p{opacity:.7}</style></head>
<body><h2>Scan to log in the userbot</h2><img id="q"><p id="s">loading...</p>
<script>
async function r(){try{const x=await fetch('/qr.png?t='+Date.now(),{cache:'no-store'});
 if(x.ok){document.getElementById('q').src=URL.createObjectURL(await x.blob());document.getElementById('s').textContent='updated '+new Date().toLocaleTimeString();}}
 catch(e){document.getElementById('s').textContent='err '+e;}}
r();setInterval(r,4000);</script></body></html>`;

http.createServer(async (req, res) => {
  if ((req.url || '').startsWith('/qr.png')) {
    png = await renderQr();
    if (!png) { res.writeHead(503); res.end('no token yet'); return; }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(png);
  } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page); }
}).listen(PORT, BIND, () => console.error(`QR page: http://${BIND}:${PORT}/`));

const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
console.error('starting QR login...');
await client.connect();
await client.signInUserWithQrCode({ apiId, apiHash }, {
  qrCode: async ({ token }) => {
    currentUrl = 'tg://login?token=' + token.toString('base64url');
    png = await renderQr();
    console.error('new QR token');
  },
  password: async () => (process.env.TG_2FA || ''),
  onError: (e) => console.error('[qr] error', e?.message || e),
});

const p = sessionPath();
fs.writeFileSync(p, client.session.save(), { mode: 0o600 });
console.error(`\nLogged in. Session saved to ${p}`);
await client.disconnect();
process.exit(0);
