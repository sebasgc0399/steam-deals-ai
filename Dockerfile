FROM node:22-alpine AS build

WORKDIR /app

# Native module support for better-sqlite3 during install/build.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/bot.db

RUN apk add --no-cache libstdc++ \
    && mkdir -p /data

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

VOLUME ["/data"]

CMD ["node", "dist/bot/index.js"]
