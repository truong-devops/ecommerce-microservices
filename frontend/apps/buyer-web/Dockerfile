ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /repo

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json turbo.json ./
COPY services/auth-service/package.json ./services/auth-service/package.json
COPY packages/backend-shared/package.json ./packages/backend-shared/package.json
COPY shared/package.json ./shared/package.json
COPY frontend/apps/buyer-web/package.json ./frontend/apps/buyer-web/package.json
COPY frontend/packages/api-client/package.json ./frontend/packages/api-client/package.json
COPY frontend/packages/constants/package.json ./frontend/packages/constants/package.json
COPY frontend/packages/hooks/package.json ./frontend/packages/hooks/package.json
COPY frontend/packages/stores/package.json ./frontend/packages/stores/package.json
COPY frontend/packages/types/package.json ./frontend/packages/types/package.json
COPY frontend/packages/ui/package.json ./frontend/packages/ui/package.json
COPY frontend/packages/utils/package.json ./frontend/packages/utils/package.json

RUN --mount=type=cache,target=/root/.npm \
  npm ci --workspace @frontend/buyer-web --no-audit --no-fund

FROM deps AS builder
WORKDIR /repo

ENV NEXT_TELEMETRY_DISABLED=1

COPY frontend/apps/buyer-web ./frontend/apps/buyer-web
COPY frontend/packages ./frontend/packages

RUN mkdir -p frontend/apps/buyer-web/public && \
  npm --workspace @frontend/buyer-web run build && \
  npm prune --omit=dev --no-audit --no-fund && \
  npm cache clean --force

FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /repo/frontend/apps/buyer-web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/apps/buyer-web/.next/static ./frontend/apps/buyer-web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/apps/buyer-web/public ./frontend/apps/buyer-web/public

USER nextjs
WORKDIR /app/frontend/apps/buyer-web

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

CMD ["node", "server.js"]
