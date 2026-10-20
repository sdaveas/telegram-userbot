FROM node:22-bookworm-slim

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node . .

ENV MCP_HTTP_PORT=8790 \
    ENV_FILE=/config/.env \
    TG_SESSION_FILE=/config/session.txt \
    SEEN_FILE=/tmp/tg-marker-seen.json

# Run as the unprivileged `node` user (uid 1000). The /config mount is
# read-only; the only thing the process writes is the marker dedup file, which
# lives in /tmp.
USER node

EXPOSE 8790
ENTRYPOINT ["bash", "/app/deploy/entrypoint.sh"]
