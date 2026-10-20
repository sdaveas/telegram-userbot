# Agent skills

[`telegram/SKILL.md`](telegram/SKILL.md) is an [Agent Skill](https://agentskills.io/)
that teaches an agent how to drive the `telegram-userbot` MCP server: which tool
to reach for, the safety rules that matter when the account belongs to a real
person, and worked recipes for the common requests.

It is plain Markdown with `name` and `description` frontmatter, so the same
folder drops into any agent that reads a `SKILL.md` - Claude Code, Cursor,
Codex, OpenClaw. There is nothing client-specific inside it.

Two steps: install the skill, then point the agent at the server.

## 1. Install the skill

Copy `telegram/` into your agent's skills directory:

| Agent | Personal | Project |
|---|---|---|
| Claude Code | `~/.claude/skills/telegram/` | `.claude/skills/telegram/` |
| Cursor | `~/.cursor/skills/telegram/` | `.cursor/skills/telegram/` |
| Cursor + Codex (shared) | - | `.agents/skills/telegram/` |
| Codex | `~/.codex/skills/telegram/` | `.codex/skills/telegram/` |
| OpenClaw | - | `<workspace>/skills/telegram/` |

```bash
# Claude Code, personal
mkdir -p ~/.claude/skills
cp -R telegram ~/.claude/skills/
```

Keep the folder name equal to the `name` in the frontmatter (`telegram`) - some
clients use it as the slash-command name.

## 2. Point the agent at the server

### stdio - the agent starts the server itself

The default. Use it when the agent and this repo are on the same machine.

```json
{
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["/absolute/path/to/telegram-userbot/src/mcp.mjs"]
    }
  }
}
```

| Client | Where that block goes |
|---|---|
| Claude Code | `.mcp.json` in the project, or `claude mcp add telegram -- node /path/to/src/mcp.mjs` |
| Cursor | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` |
| Codex | wherever your client keeps MCP server definitions |
| OpenClaw | `openclaw.json`, under a top-level `mcp` key - `mcp.servers.telegram = { "command": "node", "args": ["/path/to/src/mcp.mjs"] }` |

### HTTP - the server already runs (for example in Docker)

Set `MCP_HTTP_PORT` and an `MCP_TOKEN`, then:

```json
{
  "mcpServers": {
    "telegram": {
      "url": "http://telegram-userbot:8790/mcp",
      "transport": "streamable-http",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

OpenClaw spells the same thing as
`mcp.servers.telegram = { "url": ..., "transport": "streamable-http", "headers": { ... } }`.

`MCP_HOST` defaults to `127.0.0.1`, so an HTTP server is not reachable from other
machines until you change it - and if you do, set `MCP_TOKEN`.

## 3. Confirm it works

Ask the agent something the skill should catch:

> what's unread on Telegram?

If it reaches for `tg_unread`, both halves are wired up. If it does not, the
skill was not discovered - check that the folder name matches the frontmatter
`name`, and that the client loads skills from the directory you copied into.

## Prerequisites

- Node 20+ (or Docker) with the server installed - see the [README](../README.md).
- `TG_API_ID` / `TG_API_HASH` and a logged-in session (`npm run login`).
- `MCP_TOKEN` whenever you use the HTTP transport.
