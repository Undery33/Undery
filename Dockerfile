# syntax=docker/dockerfile:1
FROM nginx:1.30.6-alpine

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

USER 101:101
EXPOSE 8080
# The image's default entrypoint scripts modify /etc/nginx. The production
# runtime is read-only, so start Nginx directly with the prepared configuration.
ENTRYPOINT ["/usr/sbin/nginx"]
CMD ["-g", "daemon off;"]
