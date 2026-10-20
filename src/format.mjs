// Display + text helpers shared by the CLI tools and the MCP server.

export function entityName(e) {
  if (!e) return '';
  if (e.title) return e.title;                                   // group / channel
  const n = [e.firstName, e.lastName].filter(Boolean).join(' ');
  return n || e.username || (e.id ? String(e.id) : '');
}

export function chatName(msg) {
  return entityName(msg.chat) || entityName(msg.sender);
}

// collapse=true squeezes a message onto one line (good for logs and previews);
// pass collapse=false to keep the author's line breaks (puzzle grids, lists).
export function textOf(msg, { collapse = true } = {}) {
  if (msg.message) {
    const raw = String(msg.message).replace(/\r\n?/g, '\n').trim();
    return collapse ? raw.replace(/\s+/g, ' ') : raw;
  }
  if (msg.media) return `[${String(msg.media.className || 'media').replace('MessageMedia', '').toLowerCase()}]`;
  return '[empty]';
}

// Accent- and case-insensitive key: NFD-normalises and lowercases, so an
// accented chat title matches its plain spelling.
export function deaccent(s) {
  return (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
