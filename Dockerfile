# Atlas Labs — production web image (multi-stage).
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/cli/package.json packages/cli/
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV SKIP_ENV_VALIDATION=1
RUN pnpm build

# Run worker with: docker run --target worker … (or the k8s worker Deployment)
FROM build AS worker
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "scripts/worker.ts"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S atlas && adduser -S atlas -G atlas
COPY --from=build --chown=atlas:atlas /app/.next/standalone ./
COPY --from=build --chown=atlas:atlas /app/.next/static ./.next/static
COPY --from=build --chown=atlas:atlas /app/public ./public
USER atlas
EXPOSE 3000
CMD ["node", "server.js"]
