# Contributing

Thanks for taking a look. This project is deliberately small and boring; the
guidelines below keep it that way.

## The one rule that matters

**This repo is transport, not intelligence.** The server reads, sends, reacts
and forwards. It must never classify, summarise, decide, or call out to a model.
If a feature needs judgement, it belongs in the agent on the other end - that is
what [`skills/telegram/SKILL.md`](skills/telegram/SKILL.md) is for.

Practically: no network calls to any LLM or decision service, no embedded API
keys, no prompt payloads in the source.

## Development

```bash
npm install
npm test          # node:test, no build step
```

There is no build. Node 20+ runs the `.mjs` sources directly.

## Layout

- `src/` - the code (`mcp.mjs` is the MCP server; everything else is a helper)
- `test/` - unit tests, run with `node --test`
- `deploy/` - Dockerfile, compose file, entrypoint
- `skills/telegram/SKILL.md` - agent-facing usage guide

## Style

- ASCII only in source and docs. The two exceptions are `✍️` (the reaction
  marker) and the sticker emoji fallback pool, which are data the code sends to
  Telegram and must stay literal.
- Two-space indentation, LF line endings, single quotes - see `.editorconfig`.
- Comments explain *why*, not *what*.
- New `.mjs` modules: add a matching `test/*.test.mjs` where the logic is pure.

## Tests

`npm test` must pass before you open a pull request. If you touch the tool
surface, update `test/mcp.test.mjs` and the tool table in the README.

## Security

Do not open a normal issue for a security problem - see
[SECURITY.md](SECURITY.md).
