# Tandem — single-container Atlas web app (API + WS + SPA).
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json index.html server.ts ./
COPY atlas ./atlas
COPY src ./src
COPY migrations ./migrations
EXPOSE 3000
USER bun
# Apply migrations, then serve. Castle's nginx fronts this with TLS.
CMD ["sh", "-c", "bun src/db/migrate.ts up && bun server.ts"]
