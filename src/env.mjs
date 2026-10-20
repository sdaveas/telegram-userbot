// Minimal .env loader (no dependency). Loads KEY=VALUE lines into process.env
// without overriding variables that are already set.
import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(file = process.env.ENV_FILE || '.env') {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      // Double quotes: strip them and unescape, so a multi-line template fits on one line.
      val = val.slice(1, -1).replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
    } else if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

export function sessionPath() {
  return process.env.TG_SESSION_FILE || path.resolve(process.cwd(), 'session.txt');
}

// Comma-separated env var -> array of trimmed, non-empty entries.
export function list(name) {
  return String(process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function excluded() {
  return new Set(list('EXCLUDE'));
}
