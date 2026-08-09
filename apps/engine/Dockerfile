# TossAutoPilot engine worker — Fly.io / any container host
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/engine/package.json apps/engine/
RUN pnpm install --frozen-lockfile=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps/engine ./apps/engine
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/engine ./apps/engine
RUN pnpm --filter @tosspilot/shared build \
  && pnpm --filter @tosspilot/core build \
  && pnpm --filter @tosspilot/db build \
  && pnpm --filter @tosspilot/engine build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/package.json ./packages/db/
COPY --from=build /app/apps/engine/dist ./apps/engine/dist
COPY --from=build /app/apps/engine/package.json ./apps/engine/
COPY --from=build /app/node_modules ./node_modules
COPY package.json pnpm-workspace.yaml ./
EXPOSE 8787
CMD ["node", "apps/engine/dist/index.js"]
