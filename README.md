# telegram-userbot

A standalone Telegram userbot that runs **as your own account** over MTProto
([GramJS](https://github.com/gram-js/gramjs)) - it reads, searches, sends and
reacts **without a browser**.

It ships as two things over the same code:

- a **CLI** (`watch`, `send`), and
- an **MCP server**, so an agent can drive your Telegram.

**This is transport, not intelligence.** The server makes no decisions: no
summarising, no classifying, no "should I reply". Anything that needs judgement
belongs to the agent on the other end. Keeping the bot dumb is what makes it
small, predictable and safe to hand to a model.

## Why MTProto instead of a browser

| | |
|---|---|
| **Real-time** | event-driven updates, not polling or DOM scraping |
| **Full history** | `getMessages` reaches back arbitrarily far - no scrolling |
| **No Chromium** | runs happily in a 60 MB container |
| **Stable** | does not break when Telegram ships a CSS class rename |

## What you need to provide

Read "provide" as: install it if it is software, otherwise put it into your
`.env` file. `npm run login` writes `TG_API_ID` / `TG_API_HASH` into `.env` for
you; the QR flow (`npm run login:qr`) reads all of its values from there and
never prompts. See [Install](#install) for the copy step.

| | |
|---|---|
| **A Telegram account** | this runs *as you* - it is a userbot, not a bot account |
| **`api_id` + `api_hash`** | from <https://my.telegram.org> -> *API development tools*. You create the app once; Telegram may take a while to approve it, and the form asks for an app name and platform - anything sensible works. `.env` values |
| **Your phone number** | asked once by `npm run login`, at the prompt, together with the login code Telegram sends. The QR flow never asks for it - you scan with your phone instead. Not a `.env` value |
| **Node 20+** | or Docker, if you would rather not install anything on the host. Software to install - not a `.env` value |
| **An MCP client** | an agent that speaks MCP (Claude Code, Cursor, Codex, OpenClaw, ...). Install it and register this server with it. Software to install - not a `.env` value. Only needed to let an agent drive this; the CLI works on its own |

Optional, and worth doing - all of these are `.env` values:

| | |
|---|---|
| **`TG_2FA`** | your two-step password, if the account has one. The QR login reads it from `.env`; `npm run login` prompts for it instead |
| **`MCP_TOKEN`** | any random string. Without it the HTTP endpoint is unauthenticated |
| **`NOTIFY_CHAT`** | a chat title for marker notifications; defaults to your own Saved Messages |
| **`SEND_ALLOWLIST`** | the chat titles an agent is allowed to send to |

What you must **never** share: your `.env` file (gitignored - it holds the
credentials above), `session.txt`, your `api_hash`, and your `MCP_TOKEN`. The
session file is a complete login to your account.

## Install

```bash
npm install
cp .env.example .env        # then fill in TG_API_ID / TG_API_HASH
npm run login               # phone + code (+ 2FA password if you have one)
```

`npm run login` writes a `StringSession` to `session.txt` and saves the API
credentials back into `.env`. On a headless box use the QR flow instead - it
serves an auto-refreshing QR code over HTTP:

```bash
QR_PORT=8791 npm run login:qr     # open http://127.0.0.1:8791/ and scan
```

The QR flow never asks for a phone number - you scan with the phone. If the
account has two-step verification, put the password in `.env` as `TG_2FA`
before running it.

## CLI

```bash
npm start                                  # stream new messages as they arrive
EXCLUDE="Work,News" npm start              # ...ignoring these chat titles
npm run send -- "@username" "hello there"  # send as yourself
npm run send -- "Mary" "good morning"      # by (fuzzy) chat title
npm run send -- -1001234567890 "hi group"  # by numeric id
```

Chats can be addressed by `@username`, phone number, numeric id, `me` (your own
Saved Messages), or a **title** from your dialogs (accent- and
case-insensitive).

## MCP server

```bash
npm run mcp                    # stdio
MCP_HTTP_PORT=8790 npm run mcp # streamable HTTP at http://127.0.0.1:8790/mcp
```

stdio client configuration:

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

HTTP client configuration - always pair it with `MCP_TOKEN`:

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

A `GET /health` endpoint returns `ok`, which is what the Docker healthcheck uses.

### Tools

| Tool | What it does |
|---|---|
| `tg_list_chats` | list dialogs: title, unread count, last-message preview |
| `tg_unread` | only dialogs with unread messages |
| `tg_search` | filter dialogs by title substring (accent-insensitive) |
| `tg_read_chat` | most recent messages of a chat |
| `tg_read_history` | a larger slice of history (up to 500) |
| `tg_send_message` | send a text message as you |
| `tg_send_media` | send an image / GIF / video / file, from a URL or a local path |
| `tg_send_sticker` | send a sticker from your installed packs |
| `tg_react` | add or clear a reaction on a message |
| `tg_reactions` | reactions on messages in a chat; `reactors: true` adds who reacted |
| `tg_forward` | forward a message between chats (any media) |

## Reaction marker

React to any message with ✍️ (configurable) and the bot forwards that message
to a chat of your choice - by default your own **Saved Messages**. Useful as a
"flag this for the agent" gesture.

```bash
REACTION_EMOJI=✍️ NOTIFY_CHAT=me npm run reactions
```

In Docker the marker listener is attached **inside** the MCP process
(`START_LISTENER=1`) so a single MTProto session is shared. One session must
only ever be open in one process - see *Risks*.

## Docker

```bash
mkdir -p deploy/config
cp .env.example deploy/config/.env      # fill in; add session.txt too
docker compose -f deploy/docker-compose.yml up -d --build
```

`deploy/config/` is mounted read-only at `/config` and is **gitignored** - that
is where `session.txt` and your secrets live.

## Configuration

Everything is optional except the first two. See `.env.example` for the
annotated version.

| Variable | Default | Purpose |
|---|---|---|
| `TG_API_ID` | - | **required** - from my.telegram.org |
| `TG_API_HASH` | - | **required** - from my.telegram.org |
| `TG_SESSION_FILE` | `./session.txt` | where the session is stored |
| `TG_SESSION` | - | inline session string instead of a file |
| `ENV_FILE` | `.env` | which env file to load |
| `EXCLUDE` | - | chat titles to ignore in `watch` output |
| `SELF_NAME` | `ME` | how your own messages are labelled |
| `TZ_NAME` | system tz | timezone for message timestamps |
| `MCP_HTTP_PORT` | - | HTTP transport port; empty = stdio |
| `MCP_HOST` | `127.0.0.1` | HTTP bind interface |
| `MCP_TOKEN` | - | bearer token for `/mcp` - **set this** |
| `SEND_ALLOWLIST` | - | restrict `tg_send_message` to these titles |
| `REACTION_EMOJI` | `✍️` | the marker reaction |
| `NOTIFY_CHAT` | `me` | where marker notifications go |
| `MARKER_FILTER` | - | regex; only matching text is forwarded |
| `MARKER_MESSAGE` | built-in | notification body, with `{chat} {sender} {text} {msgId}` |
| `START_LISTENER` | - | `1` = attach the marker inside the MCP process |
| `SEEN_FILE` | `./tg-marker-seen.json` | marker dedup state |
| `QR_PORT` / `QR_BIND` | `8791` / `127.0.0.1` | QR login page |
| `TG_2FA` | - | two-step password for QR login |

Values are read from the environment first, then from the env file, so the
environment always wins. Double-quoted values are unescaped, so `\n`, `\t`,
`\"` and `\\` work.

## For agents

[`skills/telegram/SKILL.md`](skills/telegram/SKILL.md) is an agent-facing usage
guide in Agent Skill format: which tool to reach for, the safety rules that
matter when the account is a real person's, and worked recipes. It is plain
Markdown with `name`/`description` frontmatter, so the same folder works in
Claude Code, Cursor, Codex, OpenClaw - any agent that reads a `SKILL.md`.

[`skills/README.md`](skills/README.md) has the per-client install steps and the
MCP client configuration for both transports.

It exists because this repo deliberately contains no intelligence of its own -
so the guidance for the model driving it has to live somewhere, and that
somewhere is here rather than in the server.

## How it is put together

```
src/
  mcp.mjs              MCP server (stdio + streamable HTTP), all the tools
  client.mjs           GramJS client construction, session loading, chat lookup
  env.mjs              dependency-free .env loader
  format.mjs           display/text helpers
  login.mjs            interactive login (phone + code + 2FA)
  login-qr.mjs         headless QR login
  watch.mjs            real-time NewMessage watcher
  send.mjs             CLI send
  reaction-marker.mjs  reaction marker listener
  reactions-watch.mjs  standalone runner for the marker listener
deploy/
  Dockerfile  docker-compose.yml  entrypoint.sh
skills/
  telegram/SKILL.md    how an agent should drive these tools
  README.md            installing the skill + the server, per client
test/                  unit tests (node:test)
CONTRIBUTING.md  SECURITY.md  CHANGELOG.md
```

## Risks

- **`session.txt` *is* your account.** Anyone who has it has your Telegram.
  It is gitignored and written `0600`; treat it like a password. Revoke it from
  *Settings -> Devices* if it leaks.
- **One session = one process.** Running the same session in two clients gets
  you `AUTH_KEY_DUPLICATED` and a broken login.
- **Automating a personal account runs against Telegram's API ToS.** Accounts
  have been limited or banned for it. This is your risk to take, not a supported
  use of Telegram.
- **Without `MCP_TOKEN` the HTTP endpoint is unauthenticated.** Anyone who can
  reach the port can read your chats and send messages as you. Bind to
  `127.0.0.1` or set a token.
- **Message content is untrusted input.** A chat message can contain text that
  tries to steer the agent driving this server (prompt injection). Give the
  agent the narrowest set of tools you can, and use `SEND_ALLOWLIST`.

## License

MIT - see [LICENSE](LICENSE).
