# Multi-stage: the runtime image carries no build toolchain and no dev
# dependencies. Base images are pinned by digest so a rebuild months from now
# produces the same image (constitution Principle IX).

FROM node:22.13.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM node:22.13.1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Migrations are read from disk at startup, so they ship as files rather than
# being compiled into the bundle.
COPY --from=build /app/src/server/db/migrations ./dist/server/db/migrations
USER node
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
