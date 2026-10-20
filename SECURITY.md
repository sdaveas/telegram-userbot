# Security Policy

## Reporting

Please report vulnerabilities privately, via GitHub's *Security -> Report a
vulnerability* tab, rather than a public issue. If that is unavailable, email
the maintainer listed in `package.json`. You should get a reply within a few
days.

## What this project is (and what it is not)

`telegram-userbot` logs in as a **real Telegram account** and exposes it to a
local process and, optionally, an MCP client. That makes the threat model
unusual, and some of it is *your* responsibility to configure.

### The session file *is* the account

`session.txt` (or `TG_SESSION`) is a complete login. Anyone who has it can act
as you, with no second factor. It is gitignored and written `0600`. Treat it
exactly like your password. If it leaks, revoke the session from *Telegram ->
Settings -> Devices* immediately.

Never paste a session, `api_hash`, or `MCP_TOKEN` into an issue, a log, or a
chat.

### The HTTP endpoint is unauthenticated by default

If you set `MCP_HTTP_PORT` without `MCP_TOKEN`, anyone who can reach the port
can read your chats and send messages as you. Bind to `127.0.0.1` (the default)
and set `MCP_TOKEN` before exposing it to any network.

### Message content is untrusted input

Chat messages are attacker-controlled. Text in a message can try to steer the
agent driving this server (prompt injection). Keep the tool set as narrow as you
can and use `SEND_ALLOWLIST` to limit where an agent can send.

## Scope

In scope: bugs in this project that let an unauthenticated or lower-privileged
party read chats, send messages, or run code (for example, an auth bypass on
`/mcp`, or a path-traversal in `tg_send_media`).

Out of scope: the inherent risk of automating a personal account (against
Telegram's ToS), a user's own misconfiguration, and vulnerabilities in upstream
dependencies (report those upstream - though a heads-up is welcome).
