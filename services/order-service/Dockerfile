FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN set -eux; \
  npm config set fetch-retries 5; \
  npm config set fetch-retry-factor 2; \
  npm config set fetch-retry-mintimeout 20000; \
  npm config set fetch-retry-maxtimeout 120000; \
  npm config set fetch-timeout 120000; \
  for i in 1 2 3; do \
    npm ci --omit=dev --no-audit --no-fund && break; \
    if [ "$i" -eq 3 ]; then echo "npm ci deps failed after 3 attempts"; exit 1; fi; \
    echo "npm ci deps failed (attempt $i), retrying..."; \
    sleep $((i*10)); \
  done; \
  npm cache clean --force

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN set -eux; \
  npm config set fetch-retries 5; \
  npm config set fetch-retry-factor 2; \
  npm config set fetch-retry-mintimeout 20000; \
  npm config set fetch-retry-maxtimeout 120000; \
  npm config set fetch-timeout 120000; \
  for i in 1 2 3; do \
    npm ci --no-audit --no-fund && break; \
    if [ "$i" -eq 3 ]; then echo "npm ci builder failed after 3 attempts"; exit 1; fi; \
    echo "npm ci builder failed (attempt $i), retrying..."; \
    sleep $((i*10)); \
  done; \
  npm cache clean --force

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY migrations ./migrations

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/migrations ./migrations
COPY --chown=node:node package.json ./

USER node

EXPOSE 3002
CMD ["node", "dist/main.js"]
