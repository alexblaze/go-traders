# syntax=docker/dockerfile:1.7
# Multi-target image for the API and the web frontend.
#   docker build --target api -t nepse-api .
#   docker build --target web -t nepse-web --build-arg API_INTERNAL_URL=http://api:4000 .
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
# Optional extra CA (e.g. a corporate TLS-inspecting proxy):
#   docker build --secret id=extra_ca,src=/path/to/ca.pem ...
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ] && command -v update-ca-certificates >/dev/null 2>&1; then \
      cp /run/secrets/extra_ca /usr/local/share/ca-certificates/extra-ca.crt && update-ca-certificates; \
    fi
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
# Prisma needs OpenSSL; install it only if the base image lacks it (slim images do).
RUN if ! command -v openssl >/dev/null 2>&1; then \
      apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*; \
    fi \
  && corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# ── Dependencies (cached layer: only manifests + Prisma schema) ─────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/backtesting/package.json packages/backtesting/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/database/prisma packages/database/prisma
COPY packages/indicators/package.json packages/indicators/
COPY packages/market-data/package.json packages/market-data/
COPY packages/shared/package.json packages/shared/
COPY packages/strategies/package.json packages/strategies/
COPY scripts/package.json scripts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS source
COPY . .
RUN pnpm --filter @nepse/database run generate

# ── API ─────────────────────────────────────────────────────────────────────
FROM source AS api-build
RUN pnpm --filter @nepse/api run build

FROM base AS api
ENV NODE_ENV=production
COPY --from=api-build /app /app
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh && chown -R node:node /app
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
CMD ["node", "dist/server.js"]

# ── Web (Next.js standalone) ────────────────────────────────────────────────
FROM source AS web-build
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
RUN pnpm --filter @nepse/web run build

FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
