FROM node:20-slim AS base
RUN npm install -g pnpm@9

# --- Build stage ---
FROM base AS build
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/web/ packages/web/

RUN pnpm build:shared && pnpm build:web

# --- Nginx stage ---
FROM nginx:alpine AS production

COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
