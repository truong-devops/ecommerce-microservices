ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /repo

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json turbo.json ./
COPY services/auth-service/package.json ./services/auth-service/package.json
COPY packages/backend-shared/package.json ./packages/backend-shared/package.json
COPY shared/package.json ./shared/package.json
COPY frontend/apps/seller/package.json ./frontend/apps/seller/package.json
COPY frontend/packages/api-client/package.json ./frontend/packages/api-client/package.json
COPY frontend/packages/constants/package.json ./frontend/packages/constants/package.json
COPY frontend/packages/hooks/package.json ./frontend/packages/hooks/package.json
COPY frontend/packages/stores/package.json ./frontend/packages/stores/package.json
COPY frontend/packages/types/package.json ./frontend/packages/types/package.json
COPY frontend/packages/ui/package.json ./frontend/packages/ui/package.json
COPY frontend/packages/utils/package.json ./frontend/packages/utils/package.json

RUN --mount=type=cache,target=/root/.npm \
  npm ci --workspace @frontend/seller --no-audit --no-fund

FROM deps AS builder
WORKDIR /repo

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_BUYER_WEB_URL=https://buyer.dt-commerce.site
ARG NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL=https://api.dt-commerce.site/ecommerce-media
ARG NEXT_PUBLIC_API_GATEWAY_WS_URL=wss://api.dt-commerce.site/api/v1
ARG NEXT_PUBLIC_CHAT_WS_BASE_URL=https://api.dt-commerce.site
ENV NEXT_PUBLIC_BUYER_WEB_URL=${NEXT_PUBLIC_BUYER_WEB_URL}
ENV NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL=${NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL}
ENV NEXT_PUBLIC_API_GATEWAY_WS_URL=${NEXT_PUBLIC_API_GATEWAY_WS_URL}
ENV NEXT_PUBLIC_CHAT_WS_BASE_URL=${NEXT_PUBLIC_CHAT_WS_BASE_URL}

COPY frontend/apps/seller ./frontend/apps/seller
COPY frontend/packages ./frontend/packages

RUN mkdir -p frontend/apps/seller/public && \
  npm --workspace @frontend/seller run build && \
  npm prune --omit=dev --no-audit --no-fund && \
  npm cache clean --force

FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs && \
  rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg \
    /opt/yarn*

COPY --from=builder --chown=nextjs:nodejs /repo/frontend/apps/seller/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/apps/seller/.next/static ./frontend/apps/seller/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/apps/seller/public ./frontend/apps/seller/public

USER nextjs
WORKDIR /app/frontend/apps/seller

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

CMD ["node", "server.js"]
