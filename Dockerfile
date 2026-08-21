# syntax=docker/dockerfile:1.7

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS dependencies

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

COPY . .

# These are non-secret build-only placeholders. Pilot values are supplied only
# when the released image is run.
RUN set -eu; \
    export DATABASE_URL="postgresql://build:build-only@127.0.0.1:5432/kaul_build"; \
    export DEPLOYMENT_ENV="test"; \
    export BETTER_AUTH_SECRET="fictional-container-build-value-not-a-runtime-secret"; \
    export BETTER_AUTH_URL="http://127.0.0.1:3000"; \
    npm run prisma:generate; \
    npm run build

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ARG KAUL_COMMIT_SHA=unknown

LABEL org.opencontainers.image.title="Kaul" \
      org.opencontainers.image.description="Kaul case-management application" \
      org.opencontainers.image.revision="${KAUL_COMMIT_SHA}"

WORKDIR /app

ENV HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000

# Keep Prisma and the repository bootstrap commands in the release image so
# operators migrate and bootstrap with the exact application release. Files
# remain root-owned while the application runs as the unprivileged node user.
COPY --from=build --chown=root:root /app /app
RUN chown -R node:node /app/.next/cache

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["npm", "run", "start"]
