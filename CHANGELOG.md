# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-20

First public release.

### Added

- MCP server (stdio + streamable HTTP) exposing a Telegram account as 11 tools:
  `tg_list_chats`, `tg_unread`, `tg_search`, `tg_read_chat`, `tg_read_history`,
  `tg_send_message`, `tg_send_media`, `tg_send_sticker`, `tg_react`,
  `tg_reactions`, `tg_forward`.
- CLI: `watch` (real-time message stream) and `send`, plus interactive and
  headless QR login.
- Reaction-marker listener: react with `✍️` and the message is forwarded to a
  chat of your choice, for an agent to act on.
- Docker image + compose file, running as a non-root user.
- `skills/telegram/SKILL.md`, an agent-facing usage guide.
- Unit tests (`node:test`) and CI on Node 20 and 22.

[0.1.0]: https://github.com/sdaveas/telegram-userbot/releases/tag/v0.1.0
