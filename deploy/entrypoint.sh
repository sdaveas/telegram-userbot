#!/usr/bin/env bash
set -e
echo "[entrypoint] starting MCP (http :${MCP_HTTP_PORT:-8790}) + marker listener"
export START_LISTENER=1
exec node src/mcp.mjs
