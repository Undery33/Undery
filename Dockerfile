# syntax=docker/dockerfile:1
FROM node:24.22.2-alpine3.24 AS main-build
WORKDIR /build/main
ENV NEXT_TELEMETRY_DISABLED=1
COPY main/package.json main/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY main/ ./
ARG PIPELINE_COMMIT
RUN BUILD_COMMIT="$PIPELINE_COMMIT" SOURCE_BRANCH=feature/site-foundation npm run build

FROM nginx:1.30.6-alpine3.24

# Both stages use Alpine 3.24. Keep only the Node runtime and production trace.
COPY --from=main-build /usr/local/bin/node /usr/local/bin/node
RUN apk add --no-cache libstdc++ \
    && node --version \
    && nginx -V 2>&1 | grep -q -- --with-http_auth_request_module

ARG SOURCE_COMMIT
ARG SOURCE_BRANCH
ARG PIPELINE_COMMIT
LABEL org.opencontainers.image.source="https://github.com/Undery33/Undery" \
      org.opencontainers.image.revision="$SOURCE_COMMIT" \
      org.undery.branch="$SOURCE_BRANCH" \
      org.undery.pipeline-revision="$PIPELINE_COMMIT"

COPY --chmod=644 nginx.conf /etc/nginx/nginx.conf
COPY --chown=101:101 dist/ /opt/undery/dist/
COPY --chown=101:101 --chmod=644 health.json /opt/undery/health.json
COPY --chown=101:101 --chmod=644 asset-manifest.json /opt/undery/asset-manifest.json
COPY --from=main-build --chown=101:101 /build/main/.next/standalone/ /opt/undery/main/
COPY --chown=101:101 --chmod=644 container-entrypoint.mjs /opt/undery/container-entrypoint.mjs

ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
USER 101:101
EXPOSE 8080
# The supervisor starts both read-only services and stops both if either exits.
ENTRYPOINT ["/usr/local/bin/node", "/opt/undery/container-entrypoint.mjs"]
