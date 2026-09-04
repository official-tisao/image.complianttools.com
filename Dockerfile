# syntax=docker/dockerfile:1.7
#
# Lean production image for the static web app.
#
# Build is done on the host (or in CI) — `pnpm --filter @complianttools/web build`
# produces `apps/web/build`, a fully static site with precompressed .gz/.br
# siblings. The container just needs nginx and the build output.
#
# CI runs `pnpm build` first; this Dockerfile assumes `apps/web/build` exists.

# ---------- Stage 1: runtime ----------
FROM nginx:1.27-alpine AS runtime

# Drop privileges. Static assets are world-readable, so we only need to
# grant read access.
COPY --chown=nginx:nginx apps/web/build /usr/share/nginx/html
COPY --chown=root:root deploy/nginx.conf /etc/nginx/nginx.conf

# nginx:alpine exposes 80. The healthcheck verifies the listener is up.
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

# Foreground nginx. The base image's CMD already does this; declaring it
# explicitly here makes the intent obvious.
CMD ["nginx", "-g", "daemon off;"]
