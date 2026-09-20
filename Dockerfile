# syntax=docker/dockerfile:1.7
#
# Multi-stage build: builder produces apps/web/build inside Docker;
# runtime serves the static output with nginx — no host-side build dependency.

# ---------- Stage 1: builder ----------
FROM node:22-alpine AS builder

# Pin the exact pnpm version the repository uses.
RUN npm install -g pnpm@9.15.5

WORKDIR /app

# Copy workspace manifest and lockfile first for reproducible layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .nvmrc .env.example ./
COPY apps/web/package.json ./apps/web/
COPY packages/engine/package.json ./packages/engine/
# The root manifest pins a patched ONNX Runtime package; make the patch available
# before the lockfile install layer runs.
COPY patches/ ./patches/

# Install all workspace dependencies using the frozen lockfile.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy full source, config, and static assets required by the build.
COPY . .

# Verify WASM assets (lock allows empty list; no network fetch required).
RUN pnpm verify:wasm

# Build the image-engine dependency before the web app.
RUN pnpm --filter @complianttools/image-engine build

# Build the web application inside the container.
RUN pnpm --filter @complianttools/web build

# ---------- Stage 2: runtime ----------
FROM nginx:1.27-alpine AS runtime

# Drop privileges.
COPY --chown=nginx:nginx --from=builder /app/apps/web/build /usr/share/nginx/html
COPY --chown=root:root deploy/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=755 deploy/t32-runtime-config.sh /docker-entrypoint.d/40-t32-runtime-config.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
