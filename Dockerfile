# ---- build backend (TS -> dist) ----
# Builds only the backend. The React Mini App (web/, Stage 3) will get its own
# build stage; until then a build:api-only image is fully functional as the API +
# bot backend (the SPA fallback returns a 404 JSON when public/ is absent).
FROM node:22.11-alpine3.20 AS build-api
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build:api

# ---- runtime ----
FROM node:22.11-alpine3.20
RUN apk add --no-cache tini
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

# Production deps only (express + pg).
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build-api /app/dist ./dist

RUN addgroup -S app && adduser -S -G app -h /home/app app && chown -R app:app /app
USER app

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
