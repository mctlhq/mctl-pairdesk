# ---- build backend (TS -> dist) ----
# Builds only the backend in isolation; build:api (not the root build, which also
# drives the web build) so this stage needs no web/ sources.
FROM node:22.11-alpine3.20 AS build-api
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build:api

# ---- build landing page (Astro -> /app/public) ----
# Astro outDir is '../public' (resolved from /app/landing -> /app/public).
# Output: /app/public/index.html and /app/public/_astro/...
# Only landing/ sources are copied; no access to web/ sources.
FROM node:22.11-alpine3.20 AS build-landing
WORKDIR /app/landing
COPY landing/package*.json ./
RUN npm ci
COPY landing/ ./
RUN npm run build

# ---- build frontend SPA (Vite -> /app/public/app) ----
# Vite outDir is '../public/app' (resolved from /app/web -> /app/public/app),
# base '/app/'. The SPA lives at /app; the runtime serves it via express.static
# and the SPA fallback routes.
FROM node:22.11-alpine3.20 AS build-web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- runtime ----
FROM node:22.11-alpine3.20
RUN apk add --no-cache tini
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

# Production deps only (express + pg).
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build-api     /app/dist         ./dist
COPY --from=build-landing /app/public       ./public
COPY --from=build-web     /app/public/app   ./public/app

RUN addgroup -S app && adduser -S -G app -h /home/app app && chown -R app:app /app
USER app

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
